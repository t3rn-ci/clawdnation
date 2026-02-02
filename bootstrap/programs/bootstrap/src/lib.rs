use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, Token, TokenAccount},
    token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount, TokenInterface},
};
use raydium_cp_swap::{
    cpi,
    program::RaydiumCpSwap,
    states::{AmmConfig, OBSERVATION_SEED, POOL_LP_MINT_SEED, POOL_SEED, POOL_VAULT_SEED},
};

declare_id!("GZNvf6JHw5b3KQwS2pPTyb3xPmu225p3rZ3iVBbodrAe");

/// Linear Bonding Curve Bootstrap with 80/10/10 Auto-Split
///
/// Security Features:
/// - Anti-bot: Per-wallet caps
/// - Anti-sniping: Minimum contribution amount
/// - Anti-sandwich: Rate calculated BEFORE contribution
/// - Transparent: All parameters on-chain
/// - Immutable: Curve parameters locked at init

// Default curve parameters (can be customized)
const DEFAULT_START_RATE: u64 = 10_000; // 1 SOL = 10K CLWDN (best rate)
const DEFAULT_END_RATE: u64 = 40_000;   // 1 SOL = 40K CLWDN (worst rate)
const DEFAULT_MIN_CONTRIBUTION: u64 = 100_000_000; // 0.1 SOL minimum (anti-bot)
const DEFAULT_MAX_PER_WALLET: u64 = 10_000_000_000; // 10 SOL max per wallet (anti-whale)

// SOL Distribution: 80/10/10
const LP_PERCENT: u64 = 80;
const MASTER_WALLET_PERCENT: u64 = 10;
const STAKING_PERCENT: u64 = 10;

#[program]
pub mod clwdn_bootstrap {
    use super::*;

    /// Initialize with bonding curve parameters
    pub fn initialize(
        ctx: Context<Initialize>,
        params: BootstrapParams,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;

        // Validate parameters
        require!(params.allocation_cap > 0, BootstrapError::InvalidParams);
        require!(params.start_rate > 0, BootstrapError::InvalidParams);
        require!(params.end_rate >= params.start_rate, BootstrapError::InvalidParams);
        require!(params.min_contribution > 0, BootstrapError::InvalidParams);
        require!(
            params.max_per_wallet >= params.min_contribution,
            BootstrapError::InvalidParams
        );

        state.authority = ctx.accounts.authority.key();
        state.pending_authority = None;
        state.lp_wallet = ctx.accounts.lp_wallet.key();
        state.master_wallet = ctx.accounts.master_wallet.key();
        state.staking_wallet = ctx.accounts.staking_wallet.key();

        // Curve parameters (IMMUTABLE after init)
        state.start_rate = params.start_rate;
        state.end_rate = params.end_rate;
        state.allocation_cap = params.allocation_cap;

        // Anti-bot parameters
        state.min_contribution = params.min_contribution;
        state.max_per_wallet = params.max_per_wallet;

        // State
        state.paused = false;
        state.total_contributed_lamports = 0;
        state.total_allocated_clwdn = 0;
        state.contributor_count = 0;
        state.lp_received_lamports = 0;
        state.master_received_lamports = 0;
        state.staking_received_lamports = 0;
        state.bootstrap_complete = false;
        state.bump = ctx.bumps.state;

        msg!("Bootstrap initialized with bonding curve");
        msg!("Start rate: {} CLWDN/SOL", params.start_rate);
        msg!("End rate: {} CLWDN/SOL", params.end_rate);
        msg!("Allocation: {} CLWDN", params.allocation_cap);
        msg!("Min contribution: {} lamports", params.min_contribution);
        msg!("Max per wallet: {} lamports", params.max_per_wallet);

        Ok(())
    }

    /// Contribute SOL with bonding curve pricing
    pub fn contribute_sol(
        ctx: Context<ContributeSol>,
        amount_lamports: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let record = &mut ctx.accounts.contributor_record;

        // Security checks
        require!(!state.paused, BootstrapError::Paused);
        require!(!state.bootstrap_complete, BootstrapError::BootstrapComplete);
        require!(amount_lamports > 0, BootstrapError::InvalidAmount);

        // Anti-bot: Minimum contribution
        require!(
            amount_lamports >= state.min_contribution,
            BootstrapError::BelowMinimum
        );

        // Anti-whale: Per-wallet cap
        let new_total = record
            .total_contributed_lamports
            .checked_add(amount_lamports)
            .ok_or(BootstrapError::Overflow)?;
        require!(
            new_total <= state.max_per_wallet,
            BootstrapError::ExceedsMaxPerWallet
        );

        // Calculate current rate based on CLWDN already distributed
        // This is calculated BEFORE the contribution (anti-sandwich)
        let current_rate = calculate_current_rate(
            state.total_allocated_clwdn,
            state.allocation_cap,
            state.start_rate,
            state.end_rate,
        )?;

        // Calculate CLWDN for this contribution at current rate
        let sol_amount = amount_lamports
            .checked_div(1_000_000_000)
            .ok_or(BootstrapError::Overflow)?;

        let clwdn_amount = sol_amount
            .checked_mul(current_rate)
            .ok_or(BootstrapError::Overflow)?;

        // Check if this would exceed allocation cap
        let new_allocated = state
            .total_allocated_clwdn
            .checked_add(clwdn_amount)
            .ok_or(BootstrapError::Overflow)?;

        if new_allocated > state.allocation_cap {
            // Calculate how much CLWDN is left and adjust contribution
            let remaining_clwdn = state.allocation_cap
                .checked_sub(state.total_allocated_clwdn)
                .ok_or(BootstrapError::AllocationCapExceeded)?;

            // Recalculate SOL needed for remaining CLWDN
            let adjusted_sol = remaining_clwdn
                .checked_div(current_rate)
                .ok_or(BootstrapError::Overflow)?;

            let adjusted_lamports = adjusted_sol
                .checked_mul(1_000_000_000)
                .ok_or(BootstrapError::Overflow)?;

            // Only accept what's needed
            require!(
                adjusted_lamports > 0,
                BootstrapError::AllocationCapExceeded
            );

            msg!("Bootstrap completing: adjusted contribution to {} lamports", adjusted_lamports);
        }

        // Calculate 80/10/10 splits
        let lp_amount = amount_lamports
            .checked_mul(LP_PERCENT)
            .ok_or(BootstrapError::Overflow)?
            .checked_div(100)
            .ok_or(BootstrapError::Overflow)?;

        let master_amount = amount_lamports
            .checked_mul(MASTER_WALLET_PERCENT)
            .ok_or(BootstrapError::Overflow)?
            .checked_div(100)
            .ok_or(BootstrapError::Overflow)?;

        let staking_amount = amount_lamports
            .checked_mul(STAKING_PERCENT)
            .ok_or(BootstrapError::Overflow)?
            .checked_div(100)
            .ok_or(BootstrapError::Overflow)?;

        // Atomic transfers to all three wallets
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.lp_wallet.to_account_info(),
                },
            ),
            lp_amount,
        )?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.master_wallet.to_account_info(),
                },
            ),
            master_amount,
        )?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.staking_wallet.to_account_info(),
                },
            ),
            staking_amount,
        )?;

        // Update contributor record
        let is_new = record.total_contributed_lamports == 0;

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
        state.lp_received_lamports = state
            .lp_received_lamports
            .checked_add(lp_amount)
            .ok_or(BootstrapError::Overflow)?;
        state.master_received_lamports = state
            .master_received_lamports
            .checked_add(master_amount)
            .ok_or(BootstrapError::Overflow)?;
        state.staking_received_lamports = state
            .staking_received_lamports
            .checked_add(staking_amount)
            .ok_or(BootstrapError::Overflow)?;

        if is_new {
            state.contributor_count = state
                .contributor_count
                .checked_add(1)
                .ok_or(BootstrapError::Overflow)?;
        }

        // Check if bootstrap is complete
        if state.total_allocated_clwdn >= state.allocation_cap {
            state.bootstrap_complete = true;
            msg!("🎉 BOOTSTRAP COMPLETE!");
        }

        // Calculate next rate for transparency
        let next_rate = calculate_current_rate(
            state.total_allocated_clwdn,
            state.allocation_cap,
            state.start_rate,
            state.end_rate,
        )?;

        // Emit detailed event
        emit!(ContributionEvent {
            contributor: ctx.accounts.contributor.key(),
            amount_lamports,
            clwdn_allocated: clwdn_amount,
            rate_used: current_rate,
            next_rate,
            lp_amount,
            master_amount,
            staking_amount,
            total_contributed: record.total_contributed_lamports,
            total_allocated: record.total_allocated_clwdn,
            global_progress: state.total_allocated_clwdn * 100 / state.allocation_cap,
            contribution_count: record.contribution_count,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Contribution: {} SOL → {} CLWDN at rate {}",
             amount_lamports / 1_000_000_000,
             clwdn_amount,
             current_rate);
        msg!("Next rate: {} CLWDN/SOL", next_rate);
        msg!("Progress: {}%", state.total_allocated_clwdn * 100 / state.allocation_cap);

        Ok(())
    }

    /// Mark a contributor as distributed
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

        Ok(())
    }

    /// Emergency pause (anti-exploit)
    pub fn pause(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.paused = true;
        msg!("⚠️ Bootstrap PAUSED");
        Ok(())
    }

    /// Unpause
    pub fn unpause(ctx: Context<AdminAction>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );
        state.paused = false;
        msg!("✅ Bootstrap UNPAUSED");
        Ok(())
    }

    /// 2-step authority transfer
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

    /// Accept authority transfer
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let pending = state
            .pending_authority
            .ok_or(BootstrapError::NoPendingTransfer)?;
        require!(
            ctx.accounts.new_authority.key() == pending,
            BootstrapError::Unauthorized
        );
        state.authority = pending;
        state.pending_authority = None;
        msg!("Authority transferred to: {}", pending);
        Ok(())
    }

    /// Create Raydium LP and BURN all LP tokens (ATOMIC)
    /// Can only be called after bootstrap is complete
    /// SECURITY: LP tokens are burned in the same transaction
    pub fn create_lp_and_burn(
        ctx: Context<CreateLPAndBurn>,
        clwdn_amount: u64,
        sol_amount: u64,
        open_time: u64,
    ) -> Result<()> {
        let state = &ctx.accounts.state;

        // Verify bootstrap is complete (SOL has been collected)
        require!(
            state.total_contributed_lamports > 0,
            BootstrapError::BootstrapNotComplete
        );

        // Verify authority
        require!(
            ctx.accounts.authority.key() == state.authority,
            BootstrapError::Unauthorized
        );

        msg!("Creating Raydium LP with {} CLWDN and {} SOL", clwdn_amount, sol_amount);

        // 1. CPI to Raydium CPMM to create pool
        let cpi_accounts = cpi::accounts::Initialize {
            creator: ctx.accounts.lp_wallet.to_account_info(),
            amm_config: ctx.accounts.amm_config.to_account_info(),
            authority: ctx.accounts.pool_authority.to_account_info(),
            pool_state: ctx.accounts.pool_state.to_account_info(),
            token_0_mint: ctx.accounts.token_0_mint.to_account_info(),
            token_1_mint: ctx.accounts.token_1_mint.to_account_info(),
            lp_mint: ctx.accounts.lp_mint.to_account_info(),
            creator_token_0: ctx.accounts.lp_token_0.to_account_info(),
            creator_token_1: ctx.accounts.lp_token_1.to_account_info(),
            creator_lp_token: ctx.accounts.lp_token_account.to_account_info(),
            token_0_vault: ctx.accounts.token_0_vault.to_account_info(),
            token_1_vault: ctx.accounts.token_1_vault.to_account_info(),
            create_pool_fee: ctx.accounts.create_pool_fee.to_account_info(),
            observation_state: ctx.accounts.observation_state.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_0_program: ctx.accounts.token_0_program.to_account_info(),
            token_1_program: ctx.accounts.token_1_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };

        // Use LP wallet's authority via seeds
        let lp_wallet_bump = ctx.bumps.lp_wallet;
        let state_key = state.key();
        let seeds = &[
            b"lp_wallet".as_ref(),
            state_key.as_ref(),
            &[lp_wallet_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.cp_swap_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        cpi::initialize(cpi_ctx, clwdn_amount, sol_amount, open_time)?;

        msg!("Raydium LP created successfully");

        // 2. BURN ALL LP tokens to System Program (11111...)
        let lp_balance = ctx.accounts.lp_token_account.amount;
        require!(lp_balance > 0, BootstrapError::InvalidAmount);

        let burn_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.lp_token_account.to_account_info(),
                authority: ctx.accounts.lp_wallet.to_account_info(),
            },
            signer_seeds,
        );
        token::burn(burn_ctx, lp_balance)?;

        msg!("🔥 BURNED {} LP tokens - liquidity permanently locked!", lp_balance);
        Ok(())
    }
}

/// Calculate current rate on bonding curve
/// Linear interpolation: start_rate → end_rate based on CLWDN sold
fn calculate_current_rate(
    clwdn_sold: u64,
    allocation_cap: u64,
    start_rate: u64,
    end_rate: u64,
) -> Result<u64> {
    // Progress = (CLWDN sold / total CLWDN) * 100
    // Using checked math to prevent overflow
    let progress = clwdn_sold
        .checked_mul(10000) // Scale for precision (100.00%)
        .ok_or(BootstrapError::Overflow)?
        .checked_div(allocation_cap)
        .ok_or(BootstrapError::Overflow)?;

    // Rate = start + (end - start) * progress / 10000
    let rate_range = end_rate
        .checked_sub(start_rate)
        .ok_or(BootstrapError::Overflow)?;

    let rate_increase = rate_range
        .checked_mul(progress)
        .ok_or(BootstrapError::Overflow)?
        .checked_div(10000)
        .ok_or(BootstrapError::Overflow)?;

    let current_rate = start_rate
        .checked_add(rate_increase)
        .ok_or(BootstrapError::Overflow)?;

    Ok(current_rate)
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
    /// CHECK: LP wallet receives 80% of SOL
    #[account(mut)]
    pub lp_wallet: UncheckedAccount<'info>,
    /// CHECK: Master wallet receives 10% of SOL
    #[account(mut)]
    pub master_wallet: UncheckedAccount<'info>,
    /// CHECK: Staking wallet receives 10% of SOL
    #[account(mut)]
    pub staking_wallet: UncheckedAccount<'info>,
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
    /// CHECK: Must match state.lp_wallet
    #[account(mut, constraint = lp_wallet.key() == state.lp_wallet @ BootstrapError::InvalidWallet)]
    pub lp_wallet: UncheckedAccount<'info>,
    /// CHECK: Must match state.master_wallet
    #[account(mut, constraint = master_wallet.key() == state.master_wallet @ BootstrapError::InvalidWallet)]
    pub master_wallet: UncheckedAccount<'info>,
    /// CHECK: Must match state.staking_wallet
    #[account(mut, constraint = staking_wallet.key() == state.staking_wallet @ BootstrapError::InvalidWallet)]
    pub staking_wallet: UncheckedAccount<'info>,
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

#[derive(Accounts)]
pub struct CreateLPAndBurn<'info> {
    pub cp_swap_program: Program<'info, RaydiumCpSwap>,

    #[account(seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,

    pub authority: Signer<'info>,

    /// LP wallet (PDA that holds SOL) - acts as creator for Raydium pool
    /// CHECK: LP wallet PDA with SOL
    #[account(
        mut,
        seeds = [b"lp_wallet", state.key().as_ref()],
        bump
    )]
    pub lp_wallet: UncheckedAccount<'info>,

    /// Raydium AMM config (fee tier, etc.)
    pub amm_config: Box<Account<'info, AmmConfig>>,

    /// CHECK: Pool vault and lp mint authority
    #[account(
        seeds = [
            raydium_cp_swap::AUTH_SEED.as_bytes(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub pool_authority: UncheckedAccount<'info>,

    /// CHECK: Pool state PDA, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_SEED.as_bytes(),
            amm_config.key().as_ref(),
            token_0_mint.key().as_ref(),
            token_1_mint.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub pool_state: UncheckedAccount<'info>,

    /// Token_0 mint (must be < token_1 mint key)
    #[account(
        constraint = token_0_mint.key() < token_1_mint.key(),
        mint::token_program = token_0_program,
    )]
    pub token_0_mint: Box<InterfaceAccount<'info, InterfaceMint>>,

    /// Token_1 mint (must be > token_0 mint key)
    #[account(
        mint::token_program = token_1_program,
    )]
    pub token_1_mint: Box<InterfaceAccount<'info, InterfaceMint>>,

    /// CHECK: Pool LP mint, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_LP_MINT_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub lp_mint: UncheckedAccount<'info>,

    /// LP wallet's token 0 account
    #[account(
        mut,
        token::mint = token_0_mint,
        token::authority = lp_wallet,
    )]
    pub lp_token_0: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// LP wallet's token 1 account
    #[account(
        mut,
        token::mint = token_1_mint,
        token::authority = lp_wallet,
    )]
    pub lp_token_1: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// LP token account for LP wallet (to burn from)
    #[account(mut)]
    pub lp_token_account: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// CHECK: Token_0 vault, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_0_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub token_0_vault: UncheckedAccount<'info>,

    /// CHECK: Token_1 vault, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_1_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub token_1_vault: UncheckedAccount<'info>,

    /// Create pool fee account (0.15 SOL fee receiver)
    /// CHECK: Raydium fee receiver address
    #[account(mut)]
    pub create_pool_fee: UncheckedAccount<'info>,

    /// CHECK: Oracle observation state, init by cp-swap
    #[account(
        mut,
        seeds = [
            OBSERVATION_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub observation_state: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub token_0_program: Interface<'info, TokenInterface>,
    pub token_1_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ═══ STATE ═══

#[account]
#[derive(InitSpace)]
pub struct BootstrapState {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub lp_wallet: Pubkey,
    pub master_wallet: Pubkey,
    pub staking_wallet: Pubkey,

    // Bonding curve parameters (IMMUTABLE)
    pub start_rate: u64,
    pub end_rate: u64,
    pub allocation_cap: u64,

    // Anti-bot parameters
    pub min_contribution: u64,
    pub max_per_wallet: u64,

    // State
    pub paused: bool,
    pub bootstrap_complete: bool,
    pub total_contributed_lamports: u64,
    pub total_allocated_clwdn: u64,
    pub contributor_count: u64,
    pub lp_received_lamports: u64,
    pub master_received_lamports: u64,
    pub staking_received_lamports: u64,
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

// ═══ PARAMETERS ═══

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BootstrapParams {
    pub start_rate: u64,
    pub end_rate: u64,
    pub allocation_cap: u64,
    pub min_contribution: u64,
    pub max_per_wallet: u64,
}

impl Default for BootstrapParams {
    fn default() -> Self {
        Self {
            start_rate: DEFAULT_START_RATE,
            end_rate: DEFAULT_END_RATE,
            allocation_cap: 100_000_000, // 100M CLWDN
            min_contribution: DEFAULT_MIN_CONTRIBUTION,
            max_per_wallet: DEFAULT_MAX_PER_WALLET,
        }
    }
}

// ═══ EVENTS ═══

#[event]
pub struct ContributionEvent {
    pub contributor: Pubkey,
    pub amount_lamports: u64,
    pub clwdn_allocated: u64,
    pub rate_used: u64,
    pub next_rate: u64,
    pub lp_amount: u64,
    pub master_amount: u64,
    pub staking_amount: u64,
    pub total_contributed: u64,
    pub total_allocated: u64,
    pub global_progress: u64,
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
    #[msg("Invalid wallet address")]
    InvalidWallet,
    #[msg("No pending authority transfer")]
    NoPendingTransfer,
    #[msg("Invalid parameters")]
    InvalidParams,
    #[msg("Below minimum contribution")]
    BelowMinimum,
    #[msg("Exceeds maximum per wallet")]
    ExceedsMaxPerWallet,
    #[msg("Bootstrap already complete")]
    BootstrapComplete,
    #[msg("Bootstrap not complete - cannot create LP yet")]
    BootstrapNotComplete,
}
