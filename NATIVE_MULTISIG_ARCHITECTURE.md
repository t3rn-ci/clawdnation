# Native Multisig Architecture (No External Services)

## 🎯 WHICH ENTITIES NEED MULTISIG?

### **❌ DON'T NEED MULTISIG (Speed Critical):**

#### **1. Dispenser Operator**
- **Current:** Single hot wallet
- **Why:** Needs to respond within seconds to user contributions
- **Operations:**
  - `add_recipient()` - Queue distribution
  - `distribute()` - Send tokens
  - `mark_distributed()` - Update bootstrap
- **Risk Level:** LOW (can only execute pre-approved distributions)
- **Mitigation:** Rate limiting, amount caps per distribution

```rust
// Operator has LIMITED permissions
// Can only distribute to wallets that contributed (verified by bootstrap)
pub fn distribute(ctx: Context<Distribute>, contribution_id: String) -> Result<()> {
    // Operator can't arbitrary send tokens
    // Amount is determined by bootstrap contribution record
    // Recipient is determined by bootstrap contribution record
    // ✅ Safe for single-signer hot wallet
}
```

---

### **✅ NEED MULTISIG (Security Critical):**

#### **1. Mint Authority** ⚠️ CRITICAL
- **Current:** Single wallet (`GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE`)
- **Why:** Can print unlimited tokens = instant rugpull
- **Solution:** BURN IT (set to None) or 5-of-7 multisig
- **Operations:**
  - Mint new tokens (should be DISABLED)
- **Risk Level:** CRITICAL

**Recommended:**
```bash
# Burn mint authority (best option)
spl-token authorize <mint> mint --disable

# OR transfer to multisig for emergency use only
spl-token authorize <mint> mint <multisig-pda>
```

#### **2. Bootstrap Authority**
- **Current:** Single wallet
- **Why:** Controls pause/unpause, can change treasury
- **Operations:**
  - `pause()` / `unpause()` - Stop contributions
  - `transfer_authority()` - Change who controls it
  - `update_target()` - Change SOL target
  - `update_cap()` - Change allocation cap
- **Risk Level:** HIGH
- **Speed Requirement:** None (admin operations)

#### **3. Dispenser Authority**
- **Current:** Single wallet
- **Why:** Can add/remove operators, transfer authority
- **Operations:**
  - `add_operator()` - Grant distribution permissions
  - `remove_operator()` - Revoke permissions
  - `transfer_authority()` - Change who controls it
- **Risk Level:** HIGH
- **Speed Requirement:** None (admin operations)

#### **4. Treasury Wallet**
- **Current:** Single wallet (receives bootstrap SOL)
- **Why:** Holds all raised funds
- **Operations:**
  - Receive SOL from contributions
  - Withdraw SOL for operations
- **Risk Level:** CRITICAL
- **Speed Requirement:** None (withdrawal is admin operation)

---

## 🏗️ NATIVE ANCHOR MULTISIG IMPLEMENTATION

### **Option 1: Built-in Multisig (Simple)**

Add multisig directly to your programs:

```rust
// programs/multisig/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod native_multisig {
    use super::*;

    /// Initialize a multisig account
    pub fn initialize(
        ctx: Context<Initialize>,
        owners: Vec<Pubkey>,
        threshold: u64,
    ) -> Result<()> {
        require!(threshold > 0, MultisigError::InvalidThreshold);
        require!(threshold <= owners.len() as u64, MultisigError::ThresholdTooHigh);
        require!(owners.len() <= 10, MultisigError::TooManyOwners);

        let multisig = &mut ctx.accounts.multisig;
        multisig.owners = owners;
        multisig.threshold = threshold;
        multisig.nonce = 0;
        multisig.bump = ctx.bumps.multisig;
        Ok(())
    }

    /// Create a transaction proposal
    pub fn create_transaction(
        ctx: Context<CreateTransaction>,
        program_id: Pubkey,
        accounts: Vec<TransactionAccount>,
        data: Vec<u8>,
    ) -> Result<()> {
        let tx = &mut ctx.accounts.transaction;
        let multisig = &ctx.accounts.multisig;

        require!(
            multisig.owners.contains(&ctx.accounts.proposer.key()),
            MultisigError::NotAnOwner
        );

        tx.multisig = multisig.key();
        tx.program_id = program_id;
        tx.accounts = accounts;
        tx.data = data;
        tx.signers = vec![false; multisig.owners.len()];
        tx.did_execute = false;
        tx.nonce = multisig.nonce;

        // Automatically sign by proposer
        let owner_index = multisig.owners.iter().position(|&o| o == ctx.accounts.proposer.key()).unwrap();
        tx.signers[owner_index] = true;

        Ok(())
    }

    /// Approve a transaction
    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        let tx = &mut ctx.accounts.transaction;
        let multisig = &ctx.accounts.multisig;

        require!(
            multisig.owners.contains(&ctx.accounts.owner.key()),
            MultisigError::NotAnOwner
        );
        require!(!tx.did_execute, MultisigError::AlreadyExecuted);

        let owner_index = multisig.owners.iter().position(|&o| o == ctx.accounts.owner.key()).unwrap();
        require!(!tx.signers[owner_index], MultisigError::AlreadySigned);

        tx.signers[owner_index] = true;

        Ok(())
    }

    /// Execute a transaction once threshold is met
    pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
        let tx = &ctx.accounts.transaction;
        let multisig = &ctx.accounts.multisig;

        require!(!tx.did_execute, MultisigError::AlreadyExecuted);

        let sig_count = tx.signers.iter().filter(|&&x| x).count() as u64;
        require!(sig_count >= multisig.threshold, MultisigError::NotEnoughSigners);

        // Execute the instruction via CPI
        let mut account_infos = vec![];
        for acc in &ctx.remaining_accounts {
            account_infos.push(acc.to_account_info());
        }

        let ix = Instruction {
            program_id: tx.program_id,
            accounts: tx.accounts.iter().map(|a| AccountMeta {
                pubkey: a.pubkey,
                is_signer: a.is_signer,
                is_writable: a.is_writable,
            }).collect(),
            data: tx.data.clone(),
        };

        anchor_lang::solana_program::program::invoke(&ix, &account_infos)?;

        let tx = &mut ctx.accounts.transaction;
        tx.did_execute = true;

        Ok(())
    }
}

// ═══ ACCOUNTS ═══

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + MultisigAccount::INIT_SPACE,
        seeds = [b"multisig", payer.key().as_ref()],
        bump
    )]
    pub multisig: Account<'info, MultisigAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTransaction<'info> {
    #[account(mut, seeds = [b"multisig", multisig.key().as_ref()], bump = multisig.bump)]
    pub multisig: Account<'info, MultisigAccount>,
    #[account(
        init,
        payer = proposer,
        space = 8 + Transaction::INIT_SPACE,
        seeds = [b"transaction", multisig.key().as_ref(), &multisig.nonce.to_le_bytes()],
        bump
    )]
    pub transaction: Account<'info, Transaction>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    pub multisig: Account<'info, MultisigAccount>,
    #[account(mut, has_one = multisig)]
    pub transaction: Account<'info, Transaction>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    pub multisig: Account<'info, MultisigAccount>,
    #[account(mut, has_one = multisig)]
    pub transaction: Account<'info, Transaction>,
    pub executor: Signer<'info>,
}

// ═══ STATE ═══

#[account]
#[derive(InitSpace)]
pub struct MultisigAccount {
    #[max_len(10)]
    pub owners: Vec<Pubkey>,
    pub threshold: u64,
    pub nonce: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Transaction {
    pub multisig: Pubkey,
    pub program_id: Pubkey,
    #[max_len(10)]
    pub accounts: Vec<TransactionAccount>,
    #[max_len(1000)]
    pub data: Vec<u8>,
    #[max_len(10)]
    pub signers: Vec<bool>,
    pub did_execute: bool,
    pub nonce: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct TransactionAccount {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

// ═══ ERRORS ═══

#[error_code]
pub enum MultisigError {
    #[msg("Invalid threshold")]
    InvalidThreshold,
    #[msg("Threshold too high")]
    ThresholdTooHigh,
    #[msg("Too many owners (max 10)")]
    TooManyOwners,
    #[msg("Not an owner")]
    NotAnOwner,
    #[msg("Already executed")]
    AlreadyExecuted,
    #[msg("Already signed")]
    AlreadySigned,
    #[msg("Not enough signers")]
    NotEnoughSigners,
}
```

---

### **Option 2: SPL Governance (Feature-Rich)**

Use SPL Governance program (native to Solana, no external service):

```bash
# Create governance realm
spl-governance create-realm \
  --name "ClawdNation DAO" \
  --min-community-tokens-to-create-governance 1 \
  --use-community-voter-weight-addin false

# Create governance for bootstrap program
spl-governance create-governance \
  --realm <realm-address> \
  --governed-account <bootstrap-program-id> \
  --voter-weight-threshold 50

# Create proposal to pause bootstrap
spl-governance create-proposal \
  --governance <governance-address> \
  --instruction "pause bootstrap"

# Vote and execute
spl-governance cast-vote --proposal <proposal> --vote yes
spl-governance execute-transaction --proposal <proposal>
```

**Pros:**
- ✅ Native to Solana
- ✅ Time-locks, voting periods
- ✅ Token-weighted voting

**Cons:**
- ❌ More complex setup
- ❌ Requires governance tokens

---

## 🏛️ RECOMMENDED ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    MINT AUTHORITY                            │
│  Status: BURNED (None) - Can't mint more tokens             │
│  Control: N/A (disabled forever)                             │
│  Speed: N/A                                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               BOOTSTRAP AUTHORITY (Multisig)                 │
│  Owners: [Founder, CTO, CFO, Legal, Advisor] (5 total)      │
│  Threshold: 3 of 5 signatures                                │
│  Operations: pause, update_cap, transfer_authority           │
│  Speed: Minutes to hours (not time-critical)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              DISPENSER AUTHORITY (Multisig)                  │
│  Owners: [Founder, CTO, DevOps, Security] (4 total)         │
│  Threshold: 2 of 4 signatures                                │
│  Operations: add_operator, remove_operator                   │
│  Speed: Minutes to hours (not time-critical)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│             DISPENSER OPERATOR (Hot Wallet) ⚡               │
│  Type: Single signer (automated service)                     │
│  Operations: add_recipient, distribute, mark_distributed     │
│  Speed: < 15 seconds (time-critical)                         │
│  Risk: LOW (can only execute pre-approved distributions)     │
│  Mitigation: Rate limits, amount caps, monitoring            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  TREASURY (Multisig)                         │
│  Owners: [Founder, CFO, Legal, Board Member] (4 total)      │
│  Threshold: 3 of 4 signatures                                │
│  Holds: All SOL from bootstrap contributions                 │
│  Operations: Withdraw SOL for operations                     │
│  Speed: Hours to days (not time-critical)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 OPERATOR SAFETY MECHANISMS

Even though operator is single-signer, add these protections:

### **1. Rate Limiting**

```rust
#[account]
pub struct DispenserState {
    // ... existing fields
    pub last_distribution_slot: u64,
    pub distributions_in_hour: u32,
}

pub fn distribute(ctx: Context<Distribute>, contribution_id: String) -> Result<()> {
    let state = &mut ctx.accounts.state;
    let clock = Clock::get()?;

    // Rate limit: Max 100 distributions per hour
    if clock.slot - state.last_distribution_slot < 7200 { // ~1 hour
        require!(state.distributions_in_hour < 100, DispenserError::RateLimitExceeded);
        state.distributions_in_hour += 1;
    } else {
        state.distributions_in_hour = 1;
        state.last_distribution_slot = clock.slot;
    }

    // ... rest of distribution logic
}
```

### **2. Amount Cap Per Distribution**

```rust
pub fn distribute(ctx: Context<Distribute>, contribution_id: String) -> Result<()> {
    let amount = ctx.accounts.distribution.amount;

    // Cap single distribution to 100K CLWDN
    const MAX_SINGLE_DISTRIBUTION: u64 = 100_000_000_000_000; // 100K * 10^9
    require!(amount <= MAX_SINGLE_DISTRIBUTION, DispenserError::AmountTooLarge);

    // ... rest of logic
}
```

### **3. Pause Circuit Breaker**

```rust
#[account]
pub struct DispenserState {
    // ... existing fields
    pub paused: bool,
    pub emergency_pause_authority: Pubkey, // Can be operator for quick pause
}

pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.state.emergency_pause_authority,
        DispenserError::Unauthorized
    );

    ctx.accounts.state.paused = true;
    msg!("EMERGENCY PAUSE ACTIVATED");
    Ok(())
}

pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
    // Only multisig authority can unpause
    require!(
        ctx.accounts.authority.key() == ctx.accounts.state.authority,
        DispenserError::Unauthorized
    );

    ctx.accounts.state.paused = false;
    msg!("Unpaused by authority");
    Ok(())
}
```

### **4. Monitoring & Alerts**

```typescript
// monitoring-service.ts
import { Connection, PublicKey } from '@solana/web3.js';

const conn = new Connection(RPC);
const DISPENSER_STATE = new PublicKey('...');

setInterval(async () => {
  const state = await conn.getAccountInfo(DISPENSER_STATE);
  const data = state.data;

  // Parse state
  const totalDistributed = data.readBigUInt64LE(OFFSET);
  const lastDistribution = /* ... */;

  // Alert if suspicious activity
  if (totalDistributed > DAILY_CAP) {
    await sendAlert('🚨 Daily distribution cap exceeded!');
    await emergencyPause();
  }

  if (distributionsPerHour > 100) {
    await sendAlert('⚠️ Unusual distribution rate detected');
  }
}, 60000); // Check every minute
```

---

## 🎯 IMPLEMENTATION PLAN

### **Phase 1: Burn Mint Authority (IMMEDIATE)**

```bash
# On devnet for testing
spl-token authorize 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  mint --disable --url devnet

# Verify
spl-token display 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 --url devnet
# Should show: Mint authority: (disabled)
```

### **Phase 2: Deploy Native Multisig**

```bash
# Build multisig program
cd programs/multisig
anchor build
anchor deploy

# Initialize multisigs
node scripts/init-multisig.ts --type bootstrap --owners 5 --threshold 3
node scripts/init-multisig.ts --type dispenser --owners 4 --threshold 2
node scripts/init-multisig.ts --type treasury --owners 4 --threshold 3
```

### **Phase 3: Transfer Authorities**

```bash
# Propose authority transfers (requires current authority)
node scripts/transfer-authorities.ts --to-multisig

# Each owner approves
# Once threshold met, execute
```

### **Phase 4: Keep Operator as Hot Wallet**

```bash
# Operator stays single-signer for speed
# Add protections:
# 1. Deploy rate limiting (already in code)
# 2. Deploy amount caps (already in code)
# 3. Set up monitoring
node scripts/start-monitoring.ts

# 4. Set emergency pause authority to operator
node scripts/set-emergency-pause-operator.ts
```

---

## 📊 COMPARISON: MULTISIG vs HOT WALLET

| Entity | Type | Reason | Speed | Risk |
|--------|------|--------|-------|------|
| **Mint Authority** | BURNED | Can't rugpull | N/A | ✅ None |
| **Bootstrap Authority** | Multisig 3/5 | Controls caps/pause | Hours | ✅ Low |
| **Dispenser Authority** | Multisig 2/4 | Controls operators | Hours | ✅ Low |
| **Dispenser Operator** | Hot Wallet | Speed-critical | Seconds | ⚠️ Medium* |
| **Treasury** | Multisig 3/4 | Holds all SOL | Hours | ✅ Low |

*Medium risk mitigated by: rate limits, amount caps, monitoring, emergency pause

---

## 🔑 KEY INSIGHT

**You're absolutely correct:**
- **Operator MUST be fast** → Single signer hot wallet ✅
- **Authorities MUST be secure** → Multisig ✅
- **Mint MUST be burned** → Disabled forever ✅

The operator has LIMITED permissions:
- ✅ Can distribute to verified contributors only
- ✅ Amount is predetermined by bootstrap
- ✅ Can't send to arbitrary addresses
- ✅ Can be paused by authority
- ✅ Rate limited and capped

**This is the correct architecture for production.**

---

## 📚 FILES TO CREATE

```
programs/
  multisig/          # Native multisig program
    src/lib.rs       # Implementation above
    Cargo.toml

scripts/
  init-multisig.ts   # Create multisig accounts
  transfer-auth.ts   # Transfer authorities
  monitoring.ts      # Alert on suspicious activity

tests/
  multisig.test.ts   # Test multisig flows
```

Want me to generate these implementation files?
