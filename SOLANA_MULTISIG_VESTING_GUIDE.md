# Multisig & Vesting Solutions on Solana

## 🔐 MULTISIG SOLUTIONS

### **1. Squads Protocol (Most Popular)**

**What it is:** DAO-first multisig with advanced features
**Website:** https://squads.so
**Best for:** Production-grade multisig, DAO governance

#### Features:
- ✅ M-of-N signatures (e.g., 3 of 5)
- ✅ Time-locks for transactions
- ✅ Transaction scheduling
- ✅ Sub-accounts (like treasury wallets)
- ✅ Full UI + CLI support
- ✅ Battle-tested (billions locked)
- ✅ Supports any Solana instruction

#### Integration Example:

```typescript
import { Squads } from "@sqds/sdk";

// Create multisig
const squads = Squads.devnet(connection, wallet);
const squad = await squads.createSquad({
  members: [
    { key: member1.publicKey, permissions: { vote: true, execute: true } },
    { key: member2.publicKey, permissions: { vote: true, execute: true } },
    { key: member3.publicKey, permissions: { vote: true, execute: true } },
  ],
  threshold: 2, // 2 of 3 signatures required
  name: "ClawdNation Multisig",
});

// Propose transaction (e.g., transfer authority)
const tx = new Transaction().add(
  // Your instruction here
);
const proposal = await squads.createTransaction(squad.publicKey, tx);

// Members vote
await squads.approveTransaction(proposal.publicKey);
await squads.executeTransaction(proposal.publicKey);
```

#### For ClawdNation Bootstrap:

```rust
// Update bootstrap program to use Squads multisig as authority
pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    // new_authority should be the Squads multisig PDA
    state.authority = new_authority;
    Ok(())
}
```

**Installation:**
```bash
npm install @sqds/sdk
# or
yarn add @sqds/sdk
```

---

### **2. Goki Smart Wallet (Anchor-Native)**

**What it is:** Developer-friendly multisig protocol
**GitHub:** https://github.com/GokiProtocol/goki
**Best for:** Anchor integration, custom governance

#### Features:
- ✅ Written in Anchor (easy integration)
- ✅ Sub-wallets for different purposes
- ✅ Configurable voting strategies
- ✅ Time-delayed execution
- ✅ Open source

#### Integration Example:

```typescript
import { SmartWalletWrapper } from "@gokiprotocol/client";

const smartWallet = await SmartWalletWrapper.createSmartWallet({
  provider,
  owners: [owner1, owner2, owner3],
  threshold: 2, // 2 of 3
  numOwners: 3,
});

// Create transaction proposal
const tx = smartWallet.newTransaction({
  instructions: [
    // Your instructions
  ],
});

// Owners approve
await smartWallet.approve(tx);
await smartWallet.executeTransaction(tx);
```

**Installation:**
```bash
npm install @gokiprotocol/client
```

---

### **3. Native SPL Multisig (Lightweight)**

**What it is:** Minimal multisig built into SPL
**Best for:** Simple use cases, no dependencies

#### Features:
- ✅ Native to Solana (no external deps)
- ✅ Lightweight
- ❌ Limited to SPL token operations
- ❌ No UI (CLI only)
- ❌ No advanced features

#### CLI Usage:

```bash
# Create multisig account
spl-token create-multisig 2 <pubkey1> <pubkey2> <pubkey3>
# Returns: <multisig-address>

# Transfer using multisig
spl-token transfer <token> <amount> <recipient> \
  --multisig-signer <signer1-keypair> \
  --multisig-signer <signer2-keypair>
```

**Limitation:** Only works for SPL token operations, not custom program instructions.

---

## ⏳ VESTING SOLUTIONS

### **1. Streamflow (Most Popular)**

**What it is:** Token streaming & vesting protocol
**Website:** https://streamflow.finance
**Best for:** Team/investor vesting, payroll

#### Features:
- ✅ Linear & cliff vesting
- ✅ Cancelable/non-cancelable streams
- ✅ Automatic releases (no claim needed)
- ✅ Full UI + SDK
- ✅ Multi-token support
- ✅ Audit by Kudelski

#### Integration Example:

```typescript
import { StreamflowSolana } from "@streamflow/stream";

const client = new StreamflowSolana.SolanaStreamClient(
  "https://api.devnet.solana.com"
);

// Create vesting stream
const stream = await client.create({
  recipient: teamMemberWallet,
  tokenId: CLWDN_MINT,
  start: Math.floor(Date.now() / 1000), // Now
  amount: 150_000_000, // 150M CLWDN for team
  period: 1, // Streaming frequency (1 = every second)
  cliff: 31536000, // 1 year cliff (in seconds)
  cliffAmount: 0, // No upfront amount
  amountPerPeriod: 150_000_000 / (2 * 365 * 24 * 60 * 60), // Linear over 2 years
  name: "Team Member Vesting",
  canTopup: false,
  cancelableBySender: false, // Non-cancelable
  cancelableByRecipient: false,
  transferableBySender: false,
  transferableByRecipient: false,
  automaticWithdrawal: true, // Auto-send to recipient
  withdrawalFrequency: 86400, // Daily withdrawals
});

console.log("Vesting stream:", stream.id);
```

#### For ClawdNation Team Vesting:

```typescript
// Team allocation: 150M CLWDN, 2-year vesting
const teamMembers = [
  { wallet: "...", amount: 30_000_000 }, // 20%
  { wallet: "...", amount: 30_000_000 }, // 20%
  { wallet: "...", amount: 30_000_000 }, // 20%
  { wallet: "...", amount: 30_000_000 }, // 20%
  { wallet: "...", amount: 30_000_000 }, // 20%
];

for (const member of teamMembers) {
  await client.create({
    recipient: member.wallet,
    tokenId: CLWDN_MINT,
    start: Math.floor(Date.now() / 1000),
    amount: member.amount,
    period: 1,
    cliff: 0, // No cliff for devnet testing
    amountPerPeriod: member.amount / (2 * 365 * 24 * 60 * 60), // 2 years
    name: `Team Vesting - ${member.wallet.slice(0, 8)}`,
    cancelableBySender: false,
    automaticWithdrawal: true,
    withdrawalFrequency: 86400, // Daily
  });
}
```

**Installation:**
```bash
npm install @streamflow/stream
```

**UI:** https://app.streamflow.finance (connect wallet, create streams)

---

### **2. Bonfida Token Vesting**

**What it is:** Simple vesting contract from Bonfida (Serum DEX team)
**GitHub:** https://github.com/Bonfida/token-vesting
**Best for:** Simple linear vesting, no frills

#### Features:
- ✅ Linear vesting with cliff
- ✅ Open source (audited)
- ✅ Simple CLI
- ❌ No streaming (claim-based)
- ❌ No UI (CLI only)

#### CLI Usage:

```bash
# Install
npm install -g @bonfida/token-vesting-cli

# Create vesting contract
spl-token-vesting create \
  --mint <CLWDN_MINT> \
  --destination <team-member-wallet> \
  --amount 30000000 \
  --start-date "2024-01-01" \
  --end-date "2026-01-01" \
  --cliff-date "2024-07-01" \
  --payer <authority-keypair>

# Unlock tokens (called by recipient)
spl-token-vesting unlock \
  --vesting-account <vesting-pda>
```

#### Program Integration:

```rust
use bonfida_token_vesting::instruction::create;

// Create vesting schedule in your deployment script
let ix = create(
    &token_vesting_program_id,
    &token_program_id,
    &vesting_account_key,
    &vesting_token_account_key,
    &source_owner.pubkey(),
    &source_token_account_key,
    &destination_token_account_key,
    &mint_address,
    schedules, // Vec<Schedule>
    None, // seeds
)?;
```

---

### **3. Marinade Token Vesting (Custom)**

**What it is:** Custom vesting used by Marinade Finance
**GitHub:** https://github.com/marinade-finance/liquid-staking-program
**Best for:** Learning/reference implementation

#### Features:
- ✅ Custom logic per use case
- ✅ Integrated with staking
- ⚠️ Requires custom development

**Example Structure:**
```rust
#[account]
pub struct VestingSchedule {
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
    pub released_amount: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub cliff_timestamp: i64,
}

pub fn release(ctx: Context<Release>) -> Result<()> {
    let schedule = &mut ctx.accounts.schedule;
    let now = Clock::get()?.unix_timestamp;

    require!(now >= schedule.cliff_timestamp, VestingError::CliffNotReached);

    let elapsed = now - schedule.start_timestamp;
    let duration = schedule.end_timestamp - schedule.start_timestamp;
    let vested = (schedule.total_amount as u128)
        .checked_mul(elapsed as u128)
        .unwrap()
        .checked_div(duration as u128)
        .unwrap() as u64;

    let releasable = vested.saturating_sub(schedule.released_amount);

    // Transfer tokens...

    schedule.released_amount = schedule.released_amount.checked_add(releasable).unwrap();
    Ok(())
}
```

---

## 🏗️ RECOMMENDED ARCHITECTURE FOR CLAWDNATION

### **Phase 1: Immediate Fixes**

```
┌─────────────────────────────────────────────────┐
│  1. BURN MINT AUTHORITY                         │
│     spl-token authorize <mint> mint --disable   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  2. CREATE SQUADS MULTISIG (3-of-5)            │
│     members = [founder, dev, advisor, legal, cfo]│
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  3. TRANSFER ALL AUTHORITIES TO MULTISIG        │
│     - Bootstrap authority                        │
│     - Dispenser authority                        │
│     - Treasury wallet                            │
└─────────────────────────────────────────────────┘
```

### **Phase 2: Deploy Vesting**

```typescript
// Team Vesting (150M CLWDN, 2 years)
const streamflow = new StreamflowSolana.SolanaStreamClient(RPC);

const teamVesting = await streamflow.create({
  recipient: TEAM_MULTISIG, // Team's own multisig
  tokenId: CLWDN_MINT,
  amount: 150_000_000_000_000_000, // 150M with 9 decimals
  start: Math.floor(Date.now() / 1000),
  cliff: 0, // No cliff (can add if desired)
  amountPerPeriod: calculateLinearRate(150_000_000, 2 * 365 * 24 * 60 * 60),
  cancelableBySender: false, // Non-cancelable
  automaticWithdrawal: true,
  withdrawalFrequency: 86400, // Daily
  name: "Team Vesting - 2yr linear",
});

// Staking Rewards (150M CLWDN, 4 years)
const stakingVesting = await streamflow.create({
  recipient: STAKING_PROGRAM_PDA,
  tokenId: CLWDN_MINT,
  amount: 150_000_000_000_000_000,
  start: Math.floor(Date.now() / 1000),
  cliff: 0,
  amountPerPeriod: calculateLinearRate(150_000_000, 4 * 365 * 24 * 60 * 60),
  cancelableBySender: false,
  automaticWithdrawal: false, // Manual claim by staking program
  name: "Staking Rewards - 4yr linear",
});
```

### **Phase 3: Lock Allocations**

```typescript
// Treasury (100M CLWDN) → Squads multisig
await transferTokens({
  from: authorityWallet,
  to: TREASURY_MULTISIG,
  amount: 100_000_000,
});

// Community/Airdrops (100M CLWDN) → Time-locked until TGE+6mo
const communityLock = await streamflow.create({
  recipient: COMMUNITY_MULTISIG,
  tokenId: CLWDN_MINT,
  amount: 100_000_000_000_000_000,
  start: TGE_TIMESTAMP,
  cliff: 6 * 30 * 24 * 60 * 60, // 6 months
  amountPerPeriod: calculateLinearRate(100_000_000, 12 * 30 * 24 * 60 * 60), // 12mo linear after cliff
  cancelableBySender: false,
  name: "Community - 6mo cliff, 12mo linear",
});

// Development (50M CLWDN) → Multisig controlled
await transferTokens({
  from: authorityWallet,
  to: DEV_MULTISIG,
  amount: 50_000_000,
});

// Liquidity Pool (250M CLWDN) → Raydium pool
await createRaydiumPool({
  tokenA: CLWDN_MINT,
  tokenB: WSOL_MINT,
  amountA: 250_000_000,
  amountB: 12_500, // 12.5K SOL (20K * 0.625 for 250M/400M ratio)
});
```

---

## 💻 IMPLEMENTATION SCRIPTS

### **1. Setup Multisig**

```typescript
// setup-multisig.ts
import { Squads } from "@sqds/sdk";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const authority = Keypair.fromSecretKey(/* ... */);

const squads = Squads.devnet(connection, { publicKey: authority.publicKey });

// Create multisig
const squad = await squads.createSquad({
  members: [
    { key: MEMBER_1, permissions: { vote: true, execute: true } },
    { key: MEMBER_2, permissions: { vote: true, execute: true } },
    { key: MEMBER_3, permissions: { vote: true, execute: true } },
    { key: MEMBER_4, permissions: { vote: true, execute: true } },
    { key: MEMBER_5, permissions: { vote: true, execute: true } },
  ],
  threshold: 3, // 3 of 5
  name: "ClawdNation Authority",
  description: "Controls Bootstrap, Dispenser, and Treasury",
});

console.log("Multisig created:", squad.publicKey.toBase58());
console.log("Save this address to your .env file");

// Transfer bootstrap authority
const transferTx = await squads.createTransaction(
  squad.publicKey,
  new Transaction().add(
    // Bootstrap transfer_authority instruction
    createTransferAuthorityIx(squad.publicKey)
  )
);

console.log("Proposal created:", transferTx.publicKey.toBase58());
console.log("Members need to approve and execute");
```

### **2. Deploy Vesting**

```typescript
// deploy-vesting.ts
import { StreamflowSolana } from "@streamflow/stream";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const authority = Keypair.fromSecretKey(/* ... */);

const client = new StreamflowSolana.SolanaStreamClient(connection, "devnet");

const CLWDN_MINT = "2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3";

// Team vesting
const teamStream = await client.create({
  sender: authority,
  recipient: TEAM_MULTISIG,
  mint: CLWDN_MINT,
  start: Math.floor(Date.now() / 1000),
  depositedAmount: 150_000_000_000_000_000n, // 150M * 10^9
  period: 1,
  cliff: 0,
  cliffAmount: 0n,
  amountPerPeriod: 150_000_000_000_000_000n / BigInt(2 * 365 * 24 * 60 * 60),
  name: "Team Vesting",
  canTopup: false,
  cancelableBySender: false,
  cancelableByRecipient: false,
  transferableBySender: false,
  transferableByRecipient: false,
  automaticWithdrawal: true,
  withdrawalFrequency: 86400,
});

console.log("Team vesting deployed:", teamStream.id);

// Staking rewards vesting
const stakingStream = await client.create({
  sender: authority,
  recipient: STAKING_PROGRAM,
  mint: CLWDN_MINT,
  start: Math.floor(Date.now() / 1000),
  depositedAmount: 150_000_000_000_000_000n,
  period: 1,
  cliff: 0,
  cliffAmount: 0n,
  amountPerPeriod: 150_000_000_000_000_000n / BigInt(4 * 365 * 24 * 60 * 60),
  name: "Staking Rewards",
  cancelableBySender: false,
  automaticWithdrawal: false, // Staking program claims
  withdrawalFrequency: 0,
});

console.log("Staking vesting deployed:", stakingStream.id);
```

---

## 📚 RESOURCES

### Documentation:
- **Squads:** https://docs.squads.so/main
- **Streamflow:** https://docs.streamflow.finance
- **Goki:** https://docs.goki.so
- **Bonfida Vesting:** https://github.com/Bonfida/token-vesting

### Examples:
- **Marinade Vesting:** https://github.com/marinade-finance/liquid-staking-program
- **Solana Program Library:** https://github.com/solana-labs/solana-program-library/tree/master/token-vesting

### Audits:
- **Squads Audit:** https://github.com/Squads-Protocol/squads-v3/tree/main/audit
- **Streamflow Audit:** https://streamflow.finance/audits

---

## 🎯 RECOMMENDATION FOR CLAWDNATION

**Best Stack:**
1. **Multisig:** Squads Protocol (most mature, best UX)
2. **Vesting:** Streamflow (automatic streaming, no claims needed)
3. **UI:** Use Squads web app + Streamflow web app (no custom UI needed)

**Why:**
- ✅ Battle-tested (billions locked)
- ✅ Full UI/UX (non-technical signers can use)
- ✅ Professional audits
- ✅ Active development/support
- ✅ Industry standard

**Alternative for DIY:**
- Goki + Bonfida (if you want more control, willing to build UI)

---

## ⚠️ IMPORTANT NOTES

1. **Test on Devnet First**
   - Deploy multisig on devnet
   - Test vesting schedules
   - Verify all flows work

2. **Document Everything**
   - Save all PDA addresses
   - Document multisig members
   - Publish vesting schedule on-chain

3. **Gradual Migration**
   - Don't transfer everything at once
   - Test with small amounts first
   - Verify before moving large sums

4. **Backup Keys**
   - Multisig members need secure key storage
   - Use hardware wallets (Ledger)
   - Document recovery process

---

**Implementation Time:**
- Multisig setup: 1-2 hours
- Vesting deployment: 2-4 hours
- Testing: 1-2 days
- **Total: ~1 week** for complete migration

