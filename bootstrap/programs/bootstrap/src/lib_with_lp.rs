use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Burn};

declare_id!("BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN");

/// Fixed rate: 1 SOL = 10,000 CLWDN (bootstrap phase)
const CLWDN_PER_SOL: u64 = 10_000;
const CLWDN_DECIMALS: u8 = 9;

/// LP ratio: 1 SOL = 40,000 CLWDN (4x bootstrap rate)
const LP_CLWDN_PER_SOL: u64 = 40_000;

#[program]
pub mod clwdn_bootstrap {
    use super::*;

    /// Initialize the bootstrap program
    pub fn initialize(
        ctx: Context<Initialize>,
        target_sol: u64,
        allocation_cap: u64,
        lp_clwdn_amount: u64,
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
        state.lp_clwdn_amount = lp_clwdn_amount;
        state.lp_created = false;
        state.lp_pool = None;
        state.bootstrap_complete = false;
        state.bump = ctx.bumps.state;
        msg!("Bootstrap initialized. Target: {} SOL, Cap: {} CLWDN, LP: {} CLWDN",
             target_sol, allocation_cap, lp_clwdn_amount);
        Ok(())
    }

    /// Contribute SOL — records allocation at fixed rate, transfers SOL to treasury
    pub fn contribute_sol(
        ctx: Context<ContributeSol>,
        amount_lamports: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(!state.paused, BootstrapError::Paused);
        require!(!state.bootstrap_complete, BootstrapError::BootstrapComplete);
        require!(amount_lamports > 0, BootstrapError::InvalidAmount);

        // Calculate CLWDN allocation
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

        // Check if bootstrap is now complete
        if state.total_allocated_clwdn >= state.allocation_cap {
            state.bootstrap_complete = true;
            msg!("🎉 BOOTSTRAP COMPLETE! {} SOL raised", state.total_contributed_lamports / 1_000_000_000);
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

    /// Complete raise and prepare for LP creation
    /// This is a 2-step process:
    /// 1. complete_raise() - marks bootstrap as complete, authorizes LP creation
    /// 2. create_lp() - actually creates the Raydium pool (separate call due to complexity)
    pub fn complete_raise(ctx: Context<CompleteRaise>) -> Result<()> {
        let state = &mut ctx.accounts.state;

        // Only authority can manually complete (or it auto-completes when cap reached)
        require!(
            ctx.accounts.authority.key() == state.authority || state.total_allocated_clwdn >= state.allocation_cap,
            BootstrapError::Unauthorized
        );

        require!(!state.lp_created, BootstrapError::LpAlreadyCreated);

        state.bootstrap_complete = true;

        emit!(BootstrapCompleteEvent {
            total_sol_raised: state.total_contributed_lamports,
            total_clwdn_allocated: state.total_allocated_clwdn,
            contributor_count: state.contributor_count,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("🎉 BOOTSTRAP COMPLETE! {} SOL raised, {} CLWDN allocated",
             state.total_contributed_lamports / 1_000_000_000,
             state.total_allocated_clwdn);
        msg!("Ready for LP creation with {} CLWDN", state.lp_clwdn_amount);
        Ok(())
    }

    /// Create LP on Raydium CPMM
    /// NOTE: This is a placeholder. Actual Raydium integration requires:
    /// - Raydium CPMM program ID
    /// - Pool initialization accounts
    /// - Token vault accounts
    /// - LP mint creation
    /// See: https://github.com/raydium-io/raydium-cpmm
    pub fn create_lp(ctx: Context<CreateLp>) -> Result<()> {
        let state = &mut ctx.accounts.state;

        require!(state.bootstrap_complete, BootstrapError::BootstrapNotComplete);
        require!(!state.lp_created, BootstrapError::LpAlreadyCreated);

        // Calculate LP amounts
        let sol_for_lp = state.total_contributed_lamports;
        let clwdn_for_lp = state.lp_clwdn_amount;

        msg!("Creating LP with {} SOL + {} CLWDN", sol_for_lp / 1_000_000_000, clwdn_for_lp);

        // TODO: Integrate with Raydium CPMM program
        // This requires CPI to Raydium's initialize_pool instruction
        // For now, this is a marker that LP creation is authorized

        // Mark LP as created
        state.lp_created = true;
        state.lp_pool = Some(ctx.accounts.lp_pool.key());

        emit!(LpCreatedEvent {
            pool: ctx.accounts.lp_pool.key(),
            sol_amount: sol_for_lp,
            clwdn_amount: clwdn_for_lp,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("🔥 LP Created! Pool: {}", ctx.accounts.lp_pool.key());
        Ok(())
    }

    /// Burn LP tokens to lock liquidity forever
    pub fn burn_lp_tokens(ctx: Context<BurnLpTokens>, amount: u64) -> Result<()> {
        let state = &ctx.accounts.state;

        require!(state.lp_created, BootstrapError::LpNotCreated);
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );

        // Burn LP tokens via CPI
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.lp_token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(LpBurnedEvent {
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("🔥 LP TOKENS BURNED! Amount: {} - LIQUIDITY LOCKED FOREVER", amount);
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
pub struct CompleteRaise<'info> {
    #[account(mut, seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateLp<'info> {
    #[account(mut, seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    pub authority: Signer<'info>,
    /// CHECK: Raydium pool account (will be created)
    #[account(mut)]
    pub lp_pool: UncheckedAccount<'info>,
    /// CHECK: Treasury holding SOL for LP
    #[account(mut, constraint = treasury.key() == state.treasury @ BootstrapError::InvalidTreasury)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnLpTokens<'info> {
    #[account(seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,
    pub authority: Signer<'info>,
    /// CHECK: LP mint
    #[account(mut)]
    pub lp_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub lp_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
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
    pub lp_clwdn_amount: u64,
    pub bootstrap_complete: bool,
    pub lp_created: bool,
    pub lp_pool: Option<Pubkey>,
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

#[event]
pub struct BootstrapCompleteEvent {
    pub total_sol_raised: u64,
    pub total_clwdn_allocated: u64,
    pub contributor_count: u64,
    pub timestamp: i64,
}

#[event]
pub struct LpCreatedEvent {
    pub pool: Pubkey,
    pub sol_amount: u64,
    pub clwdn_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct LpBurnedEvent {
    pub amount: u64,
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
    #[msg("Bootstrap is already complete")]
    BootstrapComplete,
    #[msg("Bootstrap is not complete yet")]
    BootstrapNotComplete,
    #[msg("LP already created")]
    LpAlreadyCreated,
    #[msg("LP not created yet")]
    LpNotCreated,
}
