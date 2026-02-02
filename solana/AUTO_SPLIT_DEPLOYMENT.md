# 🚀 AUTOMATIC 80/10/10 BOOTSTRAP DEPLOYMENT

**Fully automated SOL splitting in smart contract**

## 📋 Overview

The bootstrap program now **automatically splits** every SOL contribution:
- **80%** → LP Wallet (for liquidity)
- **10%** → ClawdNation Master Wallet (protocol fee)
- **10%** → Staking Wallet (rewards)

**No manual splitting required** - all done on-chain!

## 🎯 Key Features

- ✅ **Automatic split** on every contribution
- ✅ **On-chain tracking** of all distributions
- ✅ **Immutable** wallet addresses (set at init)
- ✅ **Transparent** - all splits recorded in events
- ✅ **Fair** - CLWDN calculated on FULL contribution

## 🏗️ Architecture

```
User sends 100 SOL → Bootstrap Program
         ↓
    [Automatic Split]
         ↓
    ├─ 80 SOL → LP Wallet
    ├─ 10 SOL → Master Wallet
    └─ 10 SOL → Staking Wallet

User receives: 1,000,000 CLWDN (100 SOL * 10K rate)
Note: CLWDN based on FULL 100 SOL, not reduced amount!
```

## 📁 Files

| File | Purpose |
|------|---------|
| `lib_auto_split.rs` | **NEW** Bootstrap with automatic 80/10/10 split |
| `init-auto-split-bootstrap.js` | Initialization script |
| `launch.js` | Launch automation (works with auto-split) |
| `AUTO_SPLIT_DEPLOYMENT.md` | This guide |

## 🔧 Deployment Steps

### Step 1: Update Bootstrap Program

```bash
cd /Users/mbultra/projects/clawdnation/bootstrap

# Backup original
cp programs/bootstrap/src/lib.rs programs/bootstrap/src/lib_original_backup.rs

# Use auto-split version
cp programs/bootstrap/src/lib_auto_split.rs programs/bootstrap/src/lib.rs

# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

**Output:**
```
Program Id: BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN
```

### Step 2: Configure Wallets

Edit `init-auto-split-bootstrap.js`:

```javascript
// Line 23-25 - CHANGE THESE FOR PRODUCTION!
const LP_WALLET = new PublicKey('YOUR_LP_WALLET_ADDRESS');
const MASTER_WALLET = new PublicKey('YOUR_MASTER_WALLET_ADDRESS');
const STAKING_WALLET = new PublicKey('YOUR_STAKING_WALLET_ADDRESS');
```

**Important:**
- **LP_WALLET**: Wallet that will receive 80% SOL for creating LP
- **MASTER_WALLET**: ClawdNation treasury/protocol wallet (10%)
- **STAKING_WALLET**: Wallet for staking rewards distribution (10%)

For testing on devnet, you can use the same wallet for all three.

### Step 3: Initialize Bootstrap

```bash
cd ../solana

# Initialize with configuration
node init-auto-split-bootstrap.js
```

**What this does:**
- Derives bootstrap state PDA
- Shows initialization parameters
- Creates `bootstrap-config.json`

### Step 4: Run Initialization Transaction

After program is deployed, initialize on-chain:

```bash
cd ../bootstrap

# Using Anchor (if you have CLI configured)
anchor run initialize \
  --target-sol 100 \
  --allocation-cap 100000000 \
  --lp-wallet [LP_WALLET_ADDRESS] \
  --master-wallet [MASTER_WALLET_ADDRESS] \
  --staking-wallet [STAKING_WALLET_ADDRESS]
```

Or manually construct the transaction (JavaScript example in init script).

### Step 5: Verify Initialization

```bash
# Check bootstrap state
solana account 8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz --url devnet

# Should show account exists
```

### Step 6: Fund Dispenser

```bash
# Transfer 100M+ CLWDN to dispenser for bootstrap distribution
spl-token transfer \
  2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  100000000 \
  BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w \
  --url devnet \
  --fund-recipient
```

### Step 7: Launch!

```bash
cd ../solana

# Start bootstrap with automatic split
node launch.js --bootstrap --raise-target 100
```

## 🎮 How It Works

### User Contribution Flow

1. **User sends 10 SOL** to bootstrap address
2. **Bootstrap program receives** the transaction
3. **Automatic split**:
   ```
   LP: 8 SOL (80%)
   Master: 1 SOL (10%)
   Staking: 1 SOL (10%)
   ```
4. **Three transfers** execute atomically
5. **Event emitted** with split details
6. **Dispenser service** sees event
7. **User receives** 100,000 CLWDN (10 SOL * 10K rate)

### On-Chain State Tracking

The bootstrap state tracks all splits:

```rust
pub struct BootstrapState {
    pub lp_wallet: Pubkey,              // Immutable
    pub master_wallet: Pubkey,          // Immutable
    pub staking_wallet: Pubkey,         // Immutable
    pub lp_received_lamports: u64,      // Running total
    pub master_received_lamports: u64,  // Running total
    pub staking_received_lamports: u64, // Running total
    // ...
}
```

### Example: 100 SOL Raise

```
Total contributions: 100 SOL

Splits:
├─ LP Wallet: 80 SOL (80%)
├─ Master Wallet: 10 SOL (10%)
└─ Staking Wallet: 10 SOL (10%)

State tracking:
├─ total_contributed_lamports: 100 * 1e9
├─ lp_received_lamports: 80 * 1e9
├─ master_received_lamports: 10 * 1e9
└─ staking_received_lamports: 10 * 1e9

CLWDN distributed: 1,000,000 (100 SOL * 10K)
```

## 📊 Events

### ContributionEvent

Emitted on every contribution:

```rust
pub struct ContributionEvent {
    pub contributor: Pubkey,
    pub amount_lamports: u64,        // Full amount (e.g., 100 SOL)
    pub clwdn_allocated: u64,        // CLWDN based on full amount
    pub lp_amount: u64,              // 80% split
    pub master_amount: u64,          // 10% split
    pub staking_amount: u64,         // 10% split
    pub total_contributed: u64,      // Cumulative for this user
    pub total_allocated: u64,        // Cumulative CLWDN for this user
    pub contribution_count: u64,     // Number of contributions
    pub timestamp: i64,
}
```

**Use this event to:**
- Track individual contributions
- Verify splits are correct
- Monitor real-time progress
- Trigger dispenser distribution

## 🔒 Security

### Immutable Wallets

Once initialized, wallet addresses **cannot be changed**:

```rust
// Set once in initialize()
state.lp_wallet = ctx.accounts.lp_wallet.key();
state.master_wallet = ctx.accounts.master_wallet.key();
state.staking_wallet = ctx.accounts.staking_wallet.key();

// No update function exists!
```

**Why?** Prevents authority from redirecting funds after launch.

### Atomic Splits

All three transfers happen **atomically**:
- If any transfer fails, entire transaction fails
- No partial splits possible
- All-or-nothing guarantee

### Split Verification

Contract verifies splits sum correctly:

```rust
let total_split = lp_amount + master_amount + staking_amount;
require!(total_split <= amount_lamports, BootstrapError::SplitError);
```

### Wallet Validation

Contract enforces correct wallet addresses:

```rust
#[account(mut, constraint = lp_wallet.key() == state.lp_wallet)]
pub lp_wallet: UncheckedAccount<'info>,
```

## 🧪 Testing

### Test Contribution

```bash
# Send 1 SOL to bootstrap
solana transfer \
  8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz \
  1 \
  --url devnet

# Check splits
solana balance [LP_WALLET] --url devnet
# Should show 0.8 SOL increase

solana balance [MASTER_WALLET] --url devnet
# Should show 0.1 SOL increase

solana balance [STAKING_WALLET] --url devnet
# Should show 0.1 SOL increase
```

### View State

```bash
# Get bootstrap state
anchor account bootstrap.BootstrapState \
  8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz \
  --url devnet

# Should show:
# - lp_received_lamports: 800000000 (0.8 SOL)
# - master_received_lamports: 100000000 (0.1 SOL)
# - staking_received_lamports: 100000000 (0.1 SOL)
```

## 🆚 Comparison: Old vs New

| Feature | Old Bootstrap | New Auto-Split |
|---------|---------------|----------------|
| SOL Split | Manual (off-chain) | **Automatic (on-chain)** |
| Treasury | Single wallet | **3 separate wallets** |
| Split Tracking | Off-chain logs | **On-chain state** |
| Transparency | Limited | **Full transparency** |
| Trust Required | High | **Low (code enforced)** |
| Flexibility | Can change later | **Immutable after init** |

## ✅ Advantages

1. **Trustless**: Code enforces 80/10/10 split
2. **Transparent**: All splits recorded on-chain
3. **Atomic**: All-or-nothing transaction
4. **Immutable**: Wallets locked at initialization
5. **Efficient**: Single transaction, multiple transfers
6. **Auditable**: Events track every split

## ⚠️ Considerations

1. **Wallet Addresses Immutable**
   - Choose wisely at initialization
   - Cannot change after deployment
   - Test addresses on devnet first!

2. **Gas Costs**
   - Three transfers per contribution
   - Slightly higher gas than single transfer
   - Still cheap on Solana (~0.00001 SOL)

3. **Rounding**
   - Integer division may lose 1-2 lamports
   - Negligible at scale
   - Verified to not exceed input

## 🚀 Launch Checklist

- [ ] Bootstrap program deployed with auto-split
- [ ] Wallets configured (LP, Master, Staking)
- [ ] Bootstrap initialized with correct addresses
- [ ] Dispenser funded (100M+ CLWDN)
- [ ] Test contribution on devnet
- [ ] Verify splits work correctly
- [ ] Check all wallet balances
- [ ] Launch script ready (`launch.js`)
- [ ] Twitter announcement prepared
- [ ] Monitor setup for events

## 📝 Configuration File

After initialization, `bootstrap-config.json` is created:

```json
{
  "network": "devnet",
  "bootstrapProgram": "BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN",
  "bootstrapState": "8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz",
  "config": {
    "targetSol": 100,
    "allocationCap": 100000000
  },
  "wallets": {
    "lp": "LP_WALLET_ADDRESS",
    "master": "MASTER_WALLET_ADDRESS",
    "staking": "STAKING_WALLET_ADDRESS"
  },
  "solDistribution": {
    "lp": "80%",
    "master": "10%",
    "staking": "10%"
  }
}
```

Save this file for your records!

## 🎯 Next Steps

1. **Deploy program**: `anchor deploy`
2. **Initialize bootstrap**: `node init-auto-split-bootstrap.js`
3. **Fund dispenser**: Transfer 100M CLWDN
4. **Launch**: `node launch.js --bootstrap --raise-target 100`
5. **Monitor**: Watch splits happen automatically!

---

**Ready to deploy the automatic split bootstrap?**

```bash
cd bootstrap
cp programs/bootstrap/src/lib_auto_split.rs programs/bootstrap/src/lib.rs
anchor build && anchor deploy --provider.cluster devnet
```

**Questions?** Check the troubleshooting section or test on devnet first!
