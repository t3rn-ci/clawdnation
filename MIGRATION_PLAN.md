# Migration to SPL Governance + Audit Fixes

## 🎯 WHAT NEEDS TO CHANGE

### **✅ GOOD NEWS: Contracts are 90% Ready!**

Your existing contracts **already support** the authority pattern perfectly:
- ✅ `authority` field in both programs
- ✅ 2-step authority transfer (`transfer_authority()` + `accept_authority()`)
- ✅ Operator separation (operators ≠ authority)
- ✅ Checked arithmetic (overflow safe)

**SPL Governance can become the authority with ZERO contract changes!**

### **❌ WHAT NEEDS TO BE ADDED:**

#### **1. Dispenser Safety Features**
- Rate limiting (100 distributions/hour)
- Amount caps (100K CLWDN per tx)
- Emergency pause
- Pause flag

#### **2. Bootstrap Fixes**
- None! Bootstrap is perfect for multisig

#### **3. Tokenomics Fixes**
- Burn mint authority
- Fix allocation cap (100M → 200M)
- Distribute tokens per whitepaper

---

## 📝 CONTRACT CHANGES NEEDED

### **File: `dispenser/programs/dispenser/src/lib.rs`**

#### **Change 1: Update DispenserState (Add Safety Fields)**

```rust
#[account]
#[derive(InitSpace)]
pub struct DispenserState {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    #[max_len(10)]
    pub operators: Vec<Pubkey>,
    pub total_distributed: u64,
    pub total_queued: u64,
    pub total_cancelled: u64,
    pub bump: u8,

    // NEW: Safety features
    pub paused: bool,                      // Emergency pause flag
    pub last_distribution_slot: u64,       // For rate limiting
    pub distributions_this_window: u32,    // Count in current window
    pub rate_limit_per_window: u32,        // Max distributions per window (100)
    pub max_single_distribution: u64,      // Max amount per tx (100K CLWDN)
}
```

#### **Change 2: Update Initialize**

```rust
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

    // NEW: Initialize safety features
    state.paused = false;
    state.last_distribution_slot = 0;
    state.distributions_this_window = 0;
    state.rate_limit_per_window = 100; // 100 per hour
    state.max_single_distribution = 100_000_000_000_000; // 100K CLWDN with 9 decimals

    msg!("Dispenser initialized. Mint: {}", state.mint);
    Ok(())
}
```

#### **Change 3: Add Emergency Pause Functions**

```rust
/// Emergency pause (operator can call)
pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    require!(
        state.operators.contains(&ctx.accounts.operator.key()),
        DispenserError::Unauthorized
    );
    state.paused = true;
    msg!("🚨 EMERGENCY PAUSE activated by: {}", ctx.accounts.operator.key());
    Ok(())
}

/// Unpause (only authority can call)
pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    require!(
        ctx.accounts.authority.key() == state.authority,
        DispenserError::Unauthorized
    );
    state.paused = false;
    msg!("✅ Unpaused by authority");
    Ok(())
}

/// Update rate limit (authority only)
pub fn update_rate_limit(ctx: Context<UpdateConfig>, new_limit: u32) -> Result<()> {
    let state = &mut ctx.accounts.state;
    require!(
        ctx.accounts.authority.key() == state.authority,
        DispenserError::Unauthorized
    );
    state.rate_limit_per_window = new_limit;
    msg!("Rate limit updated to: {}", new_limit);
    Ok(())
}

/// Update max distribution amount (authority only)
pub fn update_max_amount(ctx: Context<UpdateConfig>, new_max: u64) -> Result<()> {
    let state = &mut ctx.accounts.state;
    require!(
        ctx.accounts.authority.key() == state.authority,
        DispenserError::Unauthorized
    );
    state.max_single_distribution = new_max;
    msg!("Max distribution updated to: {}", new_max);
    Ok(())
}
```

#### **Change 4: Add Safety Checks to Distribute**

```rust
pub fn distribute(ctx: Context<Distribute>, contribution_id: String) -> Result<()> {
    let state = &ctx.accounts.state;

    // NEW: Check if paused
    require!(!state.paused, DispenserError::Paused);

    // Read values before mutable borrows
    let amount = ctx.accounts.distribution.amount;
    let recipient = ctx.accounts.distribution.recipient;
    let status = ctx.accounts.distribution.status.clone();
    let bump = state.bump;
    let is_operator = state.operators.contains(&ctx.accounts.operator.key());

    require!(is_operator, DispenserError::Unauthorized);
    require!(
        status == DistributionStatus::Queued,
        DispenserError::AlreadyDistributed
    );

    // NEW: Check amount cap
    require!(
        amount <= state.max_single_distribution,
        DispenserError::AmountTooLarge
    );

    // NEW: Rate limiting check
    let clock = Clock::get()?;
    let slots_per_hour = 7200; // ~1 hour at 400ms/slot

    let state_mut = &mut ctx.accounts.state;
    if clock.slot - state_mut.last_distribution_slot > slots_per_hour {
        // Reset window
        state_mut.last_distribution_slot = clock.slot;
        state_mut.distributions_this_window = 0;
    }

    require!(
        state_mut.distributions_this_window < state_mut.rate_limit_per_window,
        DispenserError::RateLimitExceeded
    );

    state_mut.distributions_this_window += 1;

    // Validate recipient token account owner
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
        authority: state_mut.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    // Now mutate distribution
    let dist = &mut ctx.accounts.distribution;
    dist.status = DistributionStatus::Distributed;
    dist.distributed_at = Clock::get()?.unix_timestamp;

    // Update totals
    state_mut.total_distributed = state_mut
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
```

#### **Change 5: Add New Account Contexts**

```rust
#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"state"], bump = state.bump)]
    pub state: Account<'info, DispenserState>,
    pub authority: Signer<'info>,
}
```

#### **Change 6: Add New Errors**

```rust
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

    // NEW errors
    #[msg("Dispenser is paused")]
    Paused,
    #[msg("Amount exceeds maximum per distribution")]
    AmountTooLarge,
    #[msg("Rate limit exceeded - too many distributions")]
    RateLimitExceeded,
}
```

---

## 🔧 BOOTSTRAP FIXES

### **File: `bootstrap/programs/bootstrap/src/lib.rs`**

**ONLY ONE CHANGE NEEDED:** Fix initialization cap

#### **In `solana/init-programs.js`:**

```javascript
// OLD (WRONG):
data.writeBigUInt64LE(100_000_000_000_000_000n, 16); // 100M

// NEW (CORRECT):
data.writeBigUInt64LE(200_000_000_000_000_000n, 16); // 200M
```

**That's it!** Bootstrap contract code is already perfect for multisig.

---

## 🏛️ SPL GOVERNANCE MIGRATION

### **Step 1: Install SPL Governance CLI**

```bash
cargo install spl-governance-cli --locked
```

### **Step 2: Create Governance Realm**

```bash
# Create the DAO realm
spl-governance create-realm \
  --url devnet \
  --payer ~/.config/solana/id.json \
  --name "ClawdNation DAO" \
  --council-mint <create-new-council-token> \
  --min-community-tokens-to-create-governance 1

# Save the realm address: <REALM_ADDRESS>
```

**What this creates:**
- A DAO realm (like a container for all governance)
- Council token (for governance members)
- Voting rules

### **Step 3: Create Governance for Bootstrap**

```bash
# Create governance account that will control bootstrap
spl-governance create-governance \
  --url devnet \
  --realm <REALM_ADDRESS> \
  --governed-account <BOOTSTRAP_PROGRAM_ADDRESS> \
  --governance-type program \
  --yes-vote-threshold-percentage 60 \
  --min-council-tokens-to-create-proposal 1 \
  --min-instruction-hold-up-time 0 \
  --max-voting-time 259200 # 3 days

# Save: <BOOTSTRAP_GOVERNANCE_ADDRESS>
```

### **Step 4: Create Governance for Dispenser**

```bash
spl-governance create-governance \
  --url devnet \
  --realm <REALM_ADDRESS> \
  --governed-account <DISPENSER_PROGRAM_ADDRESS> \
  --governance-type program \
  --yes-vote-threshold-percentage 50 \
  --min-council-tokens-to-create-proposal 1 \
  --min-instruction-hold-up-time 0 \
  --max-voting-time 172800 # 2 days

# Save: <DISPENSER_GOVERNANCE_ADDRESS>
```

### **Step 5: Create Governance for Treasury**

```bash
# Create a governance-controlled wallet
spl-governance create-token-governance \
  --url devnet \
  --realm <REALM_ADDRESS> \
  --governed-token-owner <TREASURY_WALLET> \
  --yes-vote-threshold-percentage 75 \
  --min-council-tokens-to-create-proposal 1 \
  --max-voting-time 432000 # 5 days

# Save: <TREASURY_GOVERNANCE_ADDRESS>
```

### **Step 6: Transfer Authorities to Governance**

```typescript
// transfer-to-governance.ts
import { Connection, Keypair, Transaction, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com');
const authority = Keypair.fromSecretKey(/* current authority */);

const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');

const BOOTSTRAP_GOVERNANCE = new PublicKey('<from step 3>');
const DISPENSER_GOVERNANCE = new PublicKey('<from step 4>');

// Transfer bootstrap authority
const [bootstrapState] = PublicKey.findProgramAddressSync(
  [Buffer.from('bootstrap')],
  BOOTSTRAP_PROGRAM
);

const bootstrapProgram = anchor.workspace.Bootstrap;
await bootstrapProgram.methods
  .transferAuthority(BOOTSTRAP_GOVERNANCE)
  .accounts({
    state: bootstrapState,
    authority: authority.publicKey,
  })
  .signers([authority])
  .rpc();

console.log('✅ Bootstrap authority proposed to governance');

// Transfer dispenser authority
const [dispenserState] = PublicKey.findProgramAddressSync(
  [Buffer.from('state')],
  DISPENSER_PROGRAM
);

const dispenserProgram = anchor.workspace.Dispenser;
await dispenserProgram.methods
  .transferAuthority(DISPENSER_GOVERNANCE)
  .accounts({
    state: dispenserState,
    authority: authority.publicKey,
  })
  .signers([authority])
  .rpc();

console.log('✅ Dispenser authority proposed to governance');

// Now governance needs to ACCEPT the authority
// This is done via a governance proposal (next step)
```

### **Step 7: Governance Accepts Authority (Via Proposal)**

```bash
# Create proposal for bootstrap to accept authority
spl-governance create-proposal \
  --url devnet \
  --realm <REALM_ADDRESS> \
  --governance <BOOTSTRAP_GOVERNANCE> \
  --title "Accept Bootstrap Authority" \
  --description "Accept authority transfer from deployer to governance"

# Add instruction to proposal
spl-governance insert-instruction \
  --url devnet \
  --proposal <PROPOSAL_ADDRESS> \
  --instruction-index 0 \
  --program-id <BOOTSTRAP_PROGRAM> \
  --instruction-data <hex-encoded-accept_authority-instruction>

# Vote on proposal (each council member)
spl-governance cast-vote \
  --url devnet \
  --proposal <PROPOSAL_ADDRESS> \
  --vote yes

# Execute after voting period
spl-governance execute-instruction \
  --url devnet \
  --proposal <PROPOSAL_ADDRESS> \
  --instruction-index 0
```

---

## 📜 SIMPLIFIED MIGRATION SCRIPTS

### **File: `scripts/migrate-to-governance.ts`**

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { execSync } from 'child_process';
import * as fs from 'fs';

const RPC = 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.HOME + '/.config/solana/id.json';

async function main() {
  console.log('🏛️  ClawdNation → SPL Governance Migration\n');

  // Step 1: Create Realm
  console.log('📜 Step 1: Creating DAO Realm...');
  const createRealm = execSync(`
    spl-governance create-realm \\
      --url ${RPC} \\
      --payer ${KEYPAIR_PATH} \\
      --name "ClawdNation DAO" \\
      --min-community-tokens-to-create-governance 1
  `).toString();

  const realmMatch = createRealm.match(/Realm address: (\w+)/);
  const REALM = realmMatch[1];
  console.log('✅ Realm created:', REALM);

  // Step 2: Create Bootstrap Governance
  console.log('\n📜 Step 2: Creating Bootstrap Governance...');
  const createBootstrapGov = execSync(`
    spl-governance create-governance \\
      --url ${RPC} \\
      --realm ${REALM} \\
      --governed-account BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN \\
      --governance-type program \\
      --yes-vote-threshold-percentage 60 \\
      --max-voting-time 259200
  `).toString();

  const bootstrapGovMatch = createBootstrapGov.match(/Governance address: (\w+)/);
  const BOOTSTRAP_GOV = bootstrapGovMatch[1];
  console.log('✅ Bootstrap Governance:', BOOTSTRAP_GOV);

  // Step 3: Create Dispenser Governance
  console.log('\n📜 Step 3: Creating Dispenser Governance...');
  const createDispenserGov = execSync(`
    spl-governance create-governance \\
      --url ${RPC} \\
      --realm ${REALM} \\
      --governed-account AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ \\
      --governance-type program \\
      --yes-vote-threshold-percentage 50 \\
      --max-voting-time 172800
  `).toString();

  const dispenserGovMatch = createDispenserGov.match(/Governance address: (\w+)/);
  const DISPENSER_GOV = dispenserGovMatch[1];
  console.log('✅ Dispenser Governance:', DISPENSER_GOV);

  // Save addresses
  const config = {
    realm: REALM,
    bootstrapGovernance: BOOTSTRAP_GOV,
    dispenserGovernance: DISPENSER_GOV,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync('governance-config.json', JSON.stringify(config, null, 2));
  console.log('\n✅ Config saved to governance-config.json');

  console.log('\n📋 NEXT STEPS:');
  console.log('1. Transfer authorities: node scripts/transfer-to-governance.ts');
  console.log('2. Governance accepts: node scripts/governance-accept.ts');
  console.log('3. Burn mint authority: spl-token authorize <mint> mint --disable');
}

main().catch(console.error);
```

---

## ⏱️ MIGRATION TIMELINE

### **Phase 1: Contract Updates (2-3 days)**
- [ ] Add safety features to dispenser
- [ ] Update tests
- [ ] Build and verify
- [ ] Deploy updated dispenser (or upgrade)

### **Phase 2: SPL Governance Setup (1 day)**
- [ ] Create DAO realm
- [ ] Create governance accounts
- [ ] Mint council tokens to members

### **Phase 3: Authority Transfer (1 day)**
- [ ] Propose authority transfers
- [ ] Governance votes and accepts
- [ ] Verify authorities transferred

### **Phase 4: Tokenomics Fixes (1 day)**
- [ ] Burn mint authority
- [ ] Fix bootstrap cap (redeploy or upgrade)
- [ ] Distribute tokens per whitepaper

### **Phase 5: Testing (3 days)**
- [ ] Test governance proposals
- [ ] Test operator still works fast
- [ ] Test emergency pause
- [ ] Test rate limits

**TOTAL: ~1-2 weeks for complete migration**

---

## 🎯 KEY ADVANTAGES OF SPL GOVERNANCE

1. **Native to Solana** - No external dependencies
2. **Battle-tested** - Used by Mango, Serum, Raydium
3. **Full UI** - Realms.today provides web interface
4. **Flexible voting** - Token-weighted, time-locks, quorum
5. **On-chain** - Fully decentralized, no server needed

Your contracts are **already perfect** for this! Just need to add safety features and transfer authority.

---

Want me to create the complete implementation files now?
