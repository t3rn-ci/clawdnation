use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN");

/// Fixed rate: 1 SOL = 10,000 CLWDN (with 9 decimals = 10_000_000_000_000 raw)
const CLWDN_PER_SOL: u64 = 10_000;
const CLWDN_DECIMALS: u8 = 9;

#[program]
pub mod clwdn_bootstrap {
    use super::*;

    /// Initialize the bootstrap program
    pub fn initialize(
        ctx: Context<Initialize>,
        target_sol: u64,
        allocation_cap: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.pending_authority = None;
        state.treasury = ctx.accounts.treasury.key();
        state.paused = false;
        state.total_contributed_lamports = 0;
        state.total_allocated_clwdn = 0;
        state.contributor_count = 0;
        state.target_sol_lamports = target_sol
            .checked_mul(1_000_000_000)
            .ok_or(BootstrapError::Overflow)?;
        state.allocation_cap = allocation_cap;
        state.bump = ctx.bumps.state;
        msg!("Bootstrap initialized. Target: {} SOL, Cap: {} CLWDN", target_sol, allocation_cap);
        Ok(())
    }

    /// Contribute SOL — records allocation at fixed rate, transfers SOL to treasury
    pub fn contribute_sol(
        ctx: Context<ContributeSol>,
        amount_lamports: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(!state.paused, BootstrapError::Paused);
        require!(amount_lamports > 0, BootstrapError::InvalidAmount);

        // Calculate CLWDN allocation
        // amount_lamports / LAMPORTS_PER_SOL * CLWDN_PER_SOL * 10^CLWDN_DECIMALS
        // = amount_lamports * CLWDN_PER_SOL * 10^CLWDN_DECIMALS / LAMPORTS_PER_SOL
        // Since LAMPORTS_PER_SOL = 10^9 and CLWDN_DECIMALS = 9, they cancel out
        // = amount_lamports * CLWDN_PER_SOL
        let clwdn_amount = (amount_lamports as u128)
            .checked_mul(CLWDN_PER_SOL as u128)
            .ok_or(BootstrapError::Overflow)? as u64;

        // Check allocation cap
        require!(
            state.total_allocated_clwdn.checked_add(clwdn_amount).ok_or(BootstrapError::Overflow)?
                <= state.allocation_cap,
            BootstrapError::AllocationCapExceeded
        );

        // Transfer SOL from contributor to treasury via CPI
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        // Update or create contributor record
        let record = &mut ctx.accounts.contributor_record;
        let is_new = record.total_contributed_lamports == 0 && record.contribution_count == 0;

        record.contributor = ctx.accounts.contributor.key();
        record.total_contributed_lamports = record
            .total_contributed_lamports
            .checked_add(amount_lamports)
            .ok_or(BootstrapError::Overflow)?;
        record.total_allocated_clwdn = record
            .total_allocated_clwdn
            .checked_add(clwdn_amount)
            .ok_or(BootstrapError::Overflow)?;
        record.contribution_count = record
            .contribution_count
            .checked_add(1)
            .ok_or(BootstrapError::Overflow)?;
        record.last_contribution_at = Clock::get()?.unix_timestamp;
        record.distributed = false;

        // Update global state
        state.total_contributed_lamports = state
            .total_contributed_lamports
            .checked_add(amount_lamports)
            .ok_or(BootstrapError::Overflow)?;
        state.total_allocated_clwdn = state
            .total_allocated_clwdn
            .checked_add(clwdn_amount)
            .ok_or(BootstrapError::Overflow)?;
        if is_new {
            state.contributor_count = state
                .contributor_count
                .checked_add(1)
                .ok_or(BootstrapError::Overflow)?;
        }

        // Emit event for dispenser service to pick up
        emit!(ContributionEvent {
            contributor: ctx.accounts.contributor.key(),
            amount_lamports,
            clwdn_allocated: clwdn_amount,
            total_contributed: record.total_contributed_lamports,
            total_allocated: record.total_allocated_clwdn,
            contribution_count: record.contribution_count,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Contribution: {} lamports from {} → {} CLWDN allocated",
            amount_lamports,
            ctx.accounts.contributor.key(),
            clwdn_amount
        );
        Ok(())
    }

    /// Mark a contributor as distributed (called by dispenser service after CLWDN transfer)
    pub fn mark_distributed(ctx: Context<MarkDistributed>) -> Result<()> {
        let state = &ctx.accounts.state;
        require!(
            ctx.accounts.operator.key() == state.authority,
            BootstrapError::Unauthorized
        );

        let record = &mut ctx.accounts.contributor_record;
        record.distributed = true;

        emit!(DistributionEvent {
            contributor: record.contributor,
            clwdn_amount: record.total_allocated_clwdn,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Marked as distributed: {}", record.contributor);
        Ok(())
    }

    /// Pause contributions
    pub fn pause(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.paused = true;
        msg!("Bootstrap PAUSED");
        Ok(())
    }

    /// Unpause contributions
    pub fn unpause(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.paused = false;
        msg!("Bootstrap UNPAUSED");
        Ok(())
    }

    /// Update target SOL
    pub fn update_target(ctx: Context<AdminAction>, new_target_sol: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.target_sol_lamports = new_target_sol
            .checked_mul(1_000_000_000)
            .ok_or(BootstrapError::Overflow)?;
        msg!("Target updated to {} SOL", new_target_sol);
        Ok(())
    }

    /// Update allocation cap
    pub fn update_cap(ctx: Context<AdminAction>, new_cap: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.allocation_cap = new_cap;
        msg!("Allocation cap updated to {}", new_cap);
        Ok(())
    }

    /// 2-step authority transfer — propose
    pub fn transfer_authority(ctx: Context<AdminAction>, new_authority: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.pending_authority = Some(new_authority);
        msg!("Authority transfer proposed: {}", new_authority);
        Ok(())
    }

    /// 2-step authority transfer — accept
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let pending = state.pending_authority.ok_or(BootstrapError::NoPendingTransfer)?;
        require!(
            ctx.accounts.new_authority.key() == pending,
            BootstrapError::Unauthorized
        );
        state.authority = pending;
        state.pending_authority = None;
        msg!("Authority transferred to: {}", pending);
        Ok(())
    }
}

// ═══ ACCOUNTS ═══

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BootstrapState::INIT_SPACE,
        seeds = [b"bootstrap"],
        bump
    )]
    pub state: Account<'info, BootstrapState>,
    /// CHECK: treasury wallet to receive SOL contributions
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ContributeSol<'info> {
    #[account(mut, seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + ContributorRecord::INIT_SPACE,
        seeds = [b"contributor", contributor.key().as_ref()],
        bump
    )]
    pub contributor_record: Account<'info, ContributorRecord>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    /// CHECK: treasury must match state.treasury
    #[account(mut, constraint = treasury.key() == state.treasury @ BootstrapError::InvalidTreasury)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkDistributed<'info> {
    #[account(seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    #[account(mut)]
    pub contributor_record: Account<'info, ContributorRecord>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(mut, seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(mut, seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    pub new_authority: Signer<'info>,
}

// ═══ STATE ═══

#[account]
#[derive(InitSpace)]
pub struct BootstrapState {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub treasury: Pubkey,
    pub paused: bool,
    pub total_contributed_lamports: u64,
    pub total_allocated_clwdn: u64,
    pub contributor_count: u64,
    pub target_sol_lamports: u64,
    pub allocation_cap: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ContributorRecord {
    pub contributor: Pubkey,
    pub total_contributed_lamports: u64,
    pub total_allocated_clwdn: u64,
    pub contribution_count: u64,
    pub last_contribution_at: i64,
    pub distributed: bool,
}

// ═══ EVENTS ═══

#[event]
pub struct ContributionEvent {
    pub contributor: Pubkey,
    pub amount_lamports: u64,
    pub clwdn_allocated: u64,
    pub total_contributed: u64,
    pub total_allocated: u64,
    pub contribution_count: u64,
    pub timestamp: i64,
}

#[event]
pub struct DistributionEvent {
    pub contributor: Pubkey,
    pub clwdn_amount: u64,
    pub timestamp: i64,
}

// ═══ ERRORS ═══

#[error_code]
pub enum BootstrapError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Bootstrap is paused")]
    Paused,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Allocation cap exceeded")]
    AllocationCapExceeded,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid treasury account")]
    InvalidTreasury,
    #[msg("No pending authority transfer")]
    NoPendingTransfer,
}
