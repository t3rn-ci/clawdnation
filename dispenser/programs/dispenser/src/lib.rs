use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};

declare_id!("AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ");

#[program]
pub mod clwdn_dispenser {
    use super::*;

    /// Initialize the dispenser with mint and operator
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.mint = ctx.accounts.mint.key();
        state.authority = ctx.accounts.authority.key();
        state.pending_authority = None;
        state.operators = vec![ctx.accounts.authority.key()];
        state.total_distributed = 0;
        state.total_queued = 0;
        state.total_cancelled = 0;
        state.bump = ctx.bumps.state;
        msg!("Dispenser initialized. Mint: {}", state.mint);
        Ok(())
    }

    /// Add an operator (max 10)
    pub fn add_operator(ctx: Context<ManageOperator>, new_operator: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.operators.contains(&ctx.accounts.operator.key()),
            DispenserError::Unauthorized
        );
        if !state.operators.contains(&new_operator) {
            state.operators.push(new_operator);
        }
        msg!("Operator added: {}", new_operator);
        Ok(())
    }

    /// Remove an operator
    pub fn remove_operator(ctx: Context<ManageOperator>, target: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.operators.contains(&ctx.accounts.operator.key()),
            DispenserError::Unauthorized
        );
        require!(target != state.authority, DispenserError::CannotRemoveAuthority);
        state.operators.retain(|op| *op != target);
        msg!("Operator removed: {}", target);
        Ok(())
    }

    /// Step 1 of authority transfer — propose new authority
    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            DispenserError::Unauthorized
        );
        state.pending_authority = Some(new_authority);
        msg!("Authority transfer proposed to: {}", new_authority);
        Ok(())
    }

    /// Step 2 of authority transfer — new authority accepts
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let pending = state.pending_authority.ok_or(DispenserError::NoPendingTransfer)?;
        require!(
            ctx.accounts.new_authority.key() == pending,
            DispenserError::Unauthorized
        );

        // Replace old authority in operators list
        let old_authority = state.authority;
        if let Some(pos) = state.operators.iter().position(|op| *op == old_authority) {
            state.operators[pos] = pending;
        } else {
            // Old authority wasn't in operators (shouldn't happen), add new one
            state.operators.push(pending);
        }

        state.authority = pending;
        state.pending_authority = None;
        msg!("Authority transferred to: {}", pending);
        Ok(())
    }

    /// Cancel a pending authority transfer
    pub fn cancel_transfer(ctx: Context<TransferAuthority>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            DispenserError::Unauthorized
        );
        state.pending_authority = None;
        msg!("Authority transfer cancelled");
        Ok(())
    }

    /// Queue a distribution — creates a PDA keyed by contribution_id
    pub fn add_recipient(
        ctx: Context<AddRecipient>,
        contribution_id: String,
        amount: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.operators.contains(&ctx.accounts.operator.key()),
            DispenserError::Unauthorized
        );
        // Fix #2: reject zero amounts
        require!(amount > 0, DispenserError::InvalidAmount);

        let dist = &mut ctx.accounts.distribution;
        dist.contribution_id = contribution_id.clone();
        dist.recipient = ctx.accounts.recipient.key();
        dist.amount = amount;
        dist.status = DistributionStatus::Queued;
        dist.queued_at = Clock::get()?.unix_timestamp;
        dist.distributed_at = 0;
        dist.bump = ctx.bumps.distribution;

        // Fix #4: checked addition to prevent overflow
        state.total_queued = state
            .total_queued
            .checked_add(amount)
            .ok_or(DispenserError::Overflow)?;

        msg!(
            "Queued: {} tokens for {} (id: {})",
            amount,
            dist.recipient,
            contribution_id
        );
        Ok(())
    }

    /// Execute a queued distribution — sends CLWDN from vault to recipient
    pub fn distribute(ctx: Context<Distribute>, contribution_id: String) -> Result<()> {
        // Read values before mutable borrows
        let amount = ctx.accounts.distribution.amount;
        let recipient = ctx.accounts.distribution.recipient;
        let status = ctx.accounts.distribution.status.clone();
        let bump = ctx.accounts.state.bump;
        let is_operator = ctx.accounts.state.operators.contains(&ctx.accounts.operator.key());

        require!(is_operator, DispenserError::Unauthorized);
        require!(
            status == DistributionStatus::Queued,
            DispenserError::AlreadyDistributed
        );

        // Fix #1: validate recipient_token_account owner matches distribution.recipient
        require!(
            ctx.accounts.recipient_token_account.owner == recipient,
            DispenserError::RecipientMismatch
        );

        // Transfer from vault to recipient using PDA signer
        let seeds = &[b"state".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.state.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        // Now mutate
        let dist = &mut ctx.accounts.distribution;
        dist.status = DistributionStatus::Distributed;
        dist.distributed_at = Clock::get()?.unix_timestamp;

        let state = &mut ctx.accounts.state;
        // Fix #4: checked addition
        state.total_distributed = state
            .total_distributed
            .checked_add(amount)
            .ok_or(DispenserError::Overflow)?;

        msg!(
            "Distributed: {} tokens to {} (id: {})",
            amount,
            recipient,
            contribution_id
        );
        Ok(())
    }

    /// Cancel a queued distribution
    pub fn cancel(ctx: Context<Cancel>, _contribution_id: String) -> Result<()> {
        let dist = &mut ctx.accounts.distribution;
        let state = &mut ctx.accounts.state;

        require!(
            state.operators.contains(&ctx.accounts.operator.key()),
            DispenserError::Unauthorized
        );
        require!(
            dist.status == DistributionStatus::Queued,
            DispenserError::NotQueued
        );

        dist.status = DistributionStatus::Cancelled;
        // Fix #4: checked subtraction
        state.total_queued = state
            .total_queued
            .checked_sub(dist.amount)
            .ok_or(DispenserError::Overflow)?;
        state.total_cancelled = state
            .total_cancelled
            .checked_add(dist.amount)
            .ok_or(DispenserError::Overflow)?;

        msg!("Cancelled distribution: {}", dist.contribution_id);
        Ok(())
    }
}

// ═══ ACCOUNTS ═══

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DispenserState::INIT_SPACE,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, DispenserState>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageOperator<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    pub new_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(contribution_id: String, amount: u64)]
pub struct AddRecipient<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    #[account(
        init,
        payer = operator,
        space = 8 + Distribution::INIT_SPACE,
        seeds = [b"dist", contribution_id.as_bytes()],
        bump
    )]
    pub distribution: Account<'info, Distribution>,
    /// CHECK: recipient wallet, validated off-chain
    pub recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(contribution_id: String)]
pub struct Distribute<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    #[account(
        mut,
        seeds = [b"dist", contribution_id.as_bytes()],
        bump = distribution.bump,
    )]
    pub distribution: Account<'info, Distribution>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = state,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub operator: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(contribution_id: String)]
pub struct Cancel<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    #[account(
        mut,
        seeds = [b"dist", contribution_id.as_bytes()],
        bump = distribution.bump,
    )]
    pub distribution: Account<'info, Distribution>,
    pub operator: Signer<'info>,
}

// ═══ STATE ═══

#[account]
#[derive(InitSpace)]
pub struct DispenserState {
    pub mint: Pubkey,
    pub authority: Pubkey,
    /// Pending authority for 2-step transfer (None if no transfer in progress)
    pub pending_authority: Option<Pubkey>,
    #[max_len(10)]
    pub operators: Vec<Pubkey>,
    pub total_distributed: u64,
    pub total_queued: u64,
    pub total_cancelled: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Distribution {
    #[max_len(64)]
    pub contribution_id: String,
    pub recipient: Pubkey,
    pub amount: u64,
    pub status: DistributionStatus,
    pub queued_at: i64,
    pub distributed_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum DistributionStatus {
    Queued,
    Distributed,
    Cancelled,
}

// ═══ ERRORS ═══

#[error_code]
pub enum DispenserError {
    #[msg("Unauthorized: not an operator")]
    Unauthorized,
    #[msg("Already distributed")]
    AlreadyDistributed,
    #[msg("Not in queued status")]
    NotQueued,
    #[msg("Cannot remove the authority")]
    CannotRemoveAuthority,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Recipient token account owner does not match distribution recipient")]
    RecipientMismatch,
    #[msg("No pending authority transfer")]
    NoPendingTransfer,
}
