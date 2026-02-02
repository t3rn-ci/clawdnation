# 🚨 CRITICAL SECURITY GAP: LP BURN NOT ON-CHAIN

## Current State

**PROBLEM**: LP creation and burn are handled OFF-CHAIN via JavaScript scripts. This is **INSECURE**.

### Current Flow (INSECURE):
1. Bootstrap contract collects SOL → splits 80% to LP wallet
2. **OFF-CHAIN** script (`create-lp-and-burn.js`) creates Raydium LP
3. **OFF-CHAIN** script burns LP tokens
4. ⚠️ **NO GUARANTEE** LP tokens get burned
5. ⚠️ **TRUST REQUIRED** that scripts run correctly
6. ⚠️ **NOT ATOMIC** - can fail between steps

### What Needs to Happen:

**Bootstrap contract MUST have `create_lp_and_burn` instruction that:**
1. Creates Raydium CPMM pool (CPI to `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`)
2. Provides liquidity (80% SOL + CLWDN)
3. **Burns ALL LP tokens to System Program (`11111...`)**
4. **ATOMIC** - all in one transaction
5. **VERIFIABLE** - on-chain proof of burn

## Required Changes

### 1. Add Dependencies

`bootstrap/programs/bootstrap/Cargo.toml`:
```toml
[dependencies]
anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }
anchor-spl = "0.31.1"  # ADD THIS
```

### 2. Add Instruction to Bootstrap Contract

`bootstrap/programs/bootstrap/src/lib.rs`:

```rust
use anchor_spl::token::{self, Token, Mint, TokenAccount, Burn};

// After accept_authority function (line 372):

/// Create Raydium LP and BURN all LP tokens (ATOMIC)
/// Can only be called after bootstrap is complete
pub fn create_lp_and_burn(ctx: Context<CreateLPAndBurn>) -> Result<()> {
    let state = &ctx.accounts.state;

    // Verify bootstrap is complete
    require!(
        state.clwdn_sold >= state.allocation_cap,
        BootstrapError::BootstrapNotComplete
    );

    // Verify authority
    require!(
        ctx.accounts.authority.key() == state.authority,
        BootstrapError::Unauthorized
    );

    // 1. CPI to Raydium CPMM to create pool
    // TODO: Need Raydium CPMM program interface
    // raydium_cpmm::cpi::initialize_pool(...)

    // 2. CPI to burn ALL LP tokens
    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.lp_mint.to_account_info(),
            from: ctx.accounts.lp_token_account.to_account_info(),
            authority: ctx.accounts.lp_wallet.to_account_info(),
        },
    );

    // Burn ALL LP tokens
    let lp_balance = ctx.accounts.lp_token_account.amount;
    token::burn(burn_ctx, lp_balance)?;

    msg!("LP created and {} LP tokens BURNED", lp_balance);
    Ok(())
}

#[derive(Accounts)]
pub struct CreateLPAndBurn<'info> {
    #[account(seeds = [b"bootstrap"], bump = state.bump)]
    pub state: Account<'info, BootstrapState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// Raydium CPMM program
    /// CHECK: Raydium CPMM program ID
    #[account(address = raydium_cpmm::ID)]
    pub raydium_program: AccountInfo<'info>,

    /// LP mint (Raydium creates this)
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    /// LP token account to burn from
    #[account(mut)]
    pub lp_token_account: Account<'info, TokenAccount>,

    /// LP wallet (PDA with SOL)
    #[account(mut)]
    pub lp_wallet: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

### 3. Add Error Code

```rust
#[error_code]
pub enum BootstrapError {
    // ... existing errors
    #[msg("Bootstrap not complete - cannot create LP yet")]
    BootstrapNotComplete,
}
```

## Raydium CPMM Integration

Need to research Raydium CPMM program interface:
- Program ID: `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`
- Required accounts for pool creation
- CPI call structure
- How LP tokens are minted
- Minimum SOL/token amounts

## Testing Requirements

1. **Unit test**: Verify LP burn happens atomically
2. **E2E test**: Full bootstrap → LP creation → burn verification
3. **Devnet test**: Real Raydium integration
4. **Verify on Solana Explorer**: LP tokens burned to `11111...`

## Timeline

**BLOCKER FOR MAINNET**: This MUST be implemented before mainnet launch.

**Estimated Time**: 4-8 hours
- Research Raydium CPMM: 2-3 hours
- Implement CPI: 2-3 hours
- Testing: 2 hours

## Alternative: Factory Pattern

If bootstrap contract can't be modified easily, create separate **LP Factory Contract**:

```rust
pub mod lp_factory {
    // Takes SOL + tokens
    // Creates Raydium pool
    // Burns LP tokens
    // All atomic
}
```

Then bootstrap contract calls this via CPI.

## Current Scripts (INSECURE - DO NOT USE FOR MAINNET)

These scripts are OFF-CHAIN and provide NO SECURITY:
- `solana/create-lp-and-burn.js` - External script (NOT SAFE)
- `solana/create-emergency-lp.js` - External script (NOT SAFE)
- `solana/raydium-lp-integration.js` - External script (NOT SAFE)

## Recommendation

**DO NOT DEPLOY TO MAINNET** until on-chain LP burn is implemented.

For devnet testing:
1. Use off-chain scripts to test flow
2. Manually verify LP burn on explorer
3. Document that this is temporary

For mainnet:
1. **MUST** implement on-chain LP burn
2. **MUST** be atomic (single transaction)
3. **MUST** be verifiable on-chain

## Status

- [x] Research Raydium CPMM program interface ✅
- [x] Add anchor-spl dependency ✅
- [x] Implement `create_lp_and_burn` instruction ✅
- [ ] Fix compilation issues (dependency version conflicts) 🚧
- [ ] Unit tests
- [ ] E2E tests
- [ ] Devnet verification
- [ ] Mainnet ready

**CURRENT: IMPLEMENTATION IN PROGRESS**

### Implementation Progress:

✅ **Completed (Commit XXX):**
- Added Raydium CP-Swap dependency to bootstrap/Cargo.toml
- Upgraded Anchor to 0.32.1 to match Raydium
- Implemented `create_lp_and_burn` instruction with:
  - CPI to Raydium CPMM initialize
  - Atomic LP token burn
  - Authority checks
  - Bootstrap complete validation
- Added `CreateLPAndBurn` accounts struct with all required Raydium accounts
- Added `BootstrapNotComplete` error

🚧 **In Progress:**
- Resolving raydium-cp-swap compilation issues
- Version conflicts between anchor-spl token vs token_interface

⏱️ **Remaining:**
- Fix compilation (est. 1-2 hours)
- Test on local validator (est. 1 hour)
- Test on devnet (est. 1 hour)

**Total Time Spent:** ~3 hours
**Estimated Remaining:** 2-4 hours

**STILL NOT SAFE FOR MAINNET UNTIL TESTED**
