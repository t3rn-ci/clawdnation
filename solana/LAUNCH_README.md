# 🚀 CLAWDNATION LAUNCH SYSTEM

**Single command to launch everything:** `node launch.js --bootstrap`

## 📋 Overview

Fully automated bootstrap → LP → burn sequence with built-in protocol fees.

### Key Features

- ✅ **Single Command**: One `--bootstrap` command does everything
- ✅ **80/10/10 SOL Split**: Automatic protocol fee distribution
- ✅ **Mandatory LP Burn**: Cannot skip - liquidity locked forever
- ✅ **Community Funded**: No team SOL needed
- ✅ **Progressive LP**: Minimal LP first, full LP after raise

## 💰 SOL Distribution (80/10/10)

Every SOL contributed to bootstrap is automatically split:

| Destination | Percentage | Purpose |
|-------------|-----------|---------|
| **Liquidity Pool** | 80% | Trading liquidity (LOCKED FOREVER) |
| **ClawdNation Master** | 10% | Protocol fee / operations |
| **Staking Rewards** | 10% | Future staking distributions |

### Example: 100 SOL Raised

```
Total: 100 SOL
├─ 80 SOL → LP (80%)
├─ 10 SOL → ClawdNation Master Wallet (10%)
└─ 10 SOL → Staking Rewards Wallet (10%)
```

### Example: 10,000 SOL Raised

```
Total: 10,000 SOL
├─ 8,000 SOL → LP (80%)
├─ 1,000 SOL → ClawdNation Master Wallet (10%)
└─ 1,000 SOL → Staking Rewards Wallet (10%)
```

## 🎯 Launch Flow

### Phase 1: Bootstrap Start

```bash
node launch.js --bootstrap --raise-target 100
```

**What happens:**
- Bootstrap opens for contributions
- Users send SOL → Get 10K CLWDN per SOL
- Script monitors for contributions
- Waits for first 8 SOL (10% of LP allocation)

### Phase 2: Create Minimal LP

**Automatic when 8 SOL collected** (for 100 SOL target):
- Takes 8 SOL from raised funds
- Pairs with 320K CLWDN
- Creates Raydium pool
- **Trading is LIVE!** 🎉

### Phase 3: Continue Bootstrap

- Monitors until target reached (100 SOL)
- Distributes 100M CLWDN total
- Collects remaining SOL

### Phase 4: Add Full Liquidity

**Automatic when 100 SOL raised:**
- Takes remaining 72 SOL (80 total - 8 already used)
- Pairs with 399.68M CLWDN (400M total - 320K already used)
- Adds to existing pool
- Full liquidity now in place

### Phase 5: Distribute Fees

**Automatic:**
- 10 SOL → ClawdNation Master Wallet
- 10 SOL → Staking Rewards Wallet

### Phase 6: Burn LP Tokens

**MANDATORY - Cannot skip:**
- Script REQUIRES confirmation
- Burn ALL LP token accounts
- Verify balance = 0
- **Liquidity locked FOREVER** 🔒

## 🔒 Mandatory LP Burn

The burn step **CANNOT BE SKIPPED**:

```javascript
let burned = false;
while (!burned) {
  console.log('Have you burned ALL LP tokens? (yes/no): ');
  // Must answer 'yes' to continue
}
```

**Why mandatory?**
- Without burn, liquidity can be rugged
- This is the final security step
- Protects community investment

**Burn commands:**

```bash
# Find all LP token accounts
spl-token accounts [LP_MINT] --url devnet

# Burn each account
for account in $(spl-token accounts [LP_MINT] --url devnet | grep -v "Token" | awk '{print $1}'); do
  spl-token burn $account ALL --url devnet
done

# Verify (MUST show 0)
spl-token balance [LP_MINT] --url devnet
```

## 🎮 Usage

### Launch with Default Target (100 SOL)

```bash
node launch.js --bootstrap
```

**Splits:**
- 80 SOL → LP
- 10 SOL → Master Wallet
- 10 SOL → Staking

### Launch with 10K SOL Target

```bash
node launch.js --bootstrap --raise-target 10000
```

**Splits:**
- 8,000 SOL → LP
- 1,000 SOL → Master Wallet
- 1,000 SOL → Staking

### View Help

```bash
node launch.js --help
```

## 📊 Tokenomics

| Allocation | Amount | % | Distribution |
|------------|--------|---|--------------|
| Bootstrap | 100M | 10% | Immediate (via bootstrap) |
| Liquidity | 400M | 40% | LP (LOCKED FOREVER) |
| Staking | 150M | 15% | 4yr linear vest |
| Team | 150M | 15% | 6m cliff + 12m vest |
| Community | 100M | 10% | Future airdrops |
| Treasury | 100M | 10% | Governance |

**Total**: 1,000M CLWDN

## 🔐 Security

### What Makes This Secure?

| Feature | Security Benefit |
|---------|-----------------|
| **80% to LP** | Majority of SOL locked in liquidity |
| **LP Burn Mandatory** | Cannot skip - enforced by script |
| **Community Funded** | No team SOL = no team advantage |
| **Progressive LP** | Early trading enables price discovery |
| **On-Chain Bootstrap** | All allocations recorded immutably |

### What Can Go Wrong?

| Risk | Mitigation |
|------|-----------|
| **User doesn't burn LP** | Script enforces with loop |
| **Wrong LP amount** | Script calculates automatically |
| **Lost LP tokens** | Verify balance before burning |

## 📁 Files

| File | Purpose |
|------|---------|
| `launch.js` | **Main launch script** (USE THIS) |
| `launch-sequence-v2.js` | Old multi-phase system (deprecated) |
| `progressive-lp-launch.js` | Old manual system (deprecated) |
| `bootstrap-progressive-lp.js` | Community-funded exploration (deprecated) |

**Only use `launch.js`** - it's the single-command automated system!

## ⚙️ Configuration

### Wallet Configuration (Edit launch.js)

```javascript
// Line 34-37
const TREASURY_WALLET = authority.publicKey; // Receives bootstrap SOL
const CLAWDNATION_MASTER_WALLET = authority.publicKey; // 10% fee
const STAKING_WALLET = authority.publicKey; // 10% staking
```

**Before mainnet:**
- Change these to actual dedicated wallets
- `CLAWDNATION_MASTER_WALLET` → Your protocol treasury
- `STAKING_WALLET` → Dedicated staking rewards wallet

### SOL Distribution (Edit launch.js)

```javascript
// Line 39-43
const SOL_DISTRIBUTION = {
  lp: 0.80, // 80% → Liquidity Pool
  masterWallet: 0.10, // 10% → ClawdNation Master Wallet
  staking: 0.10, // 10% → Staking Rewards
};
```

**To change splits:**
- Ensure they sum to 1.0 (100%)
- Adjust percentages as needed
- Example: 70/20/10 = `{ lp: 0.70, masterWallet: 0.20, staking: 0.10 }`

## 🚨 Pre-Launch Checklist

- [ ] **Bootstrap program deployed**
  ```bash
  cd bootstrap && anchor deploy --provider.cluster devnet
  ```

- [ ] **Dispenser funded with 100M+ CLWDN**
  ```bash
  spl-token transfer 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
    100000000 BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w \
    --url devnet --fund-recipient
  ```

- [ ] **Authority wallet has CLWDN for LP** (400M)

- [ ] **Wallet addresses configured correctly**
  - TREASURY_WALLET
  - CLAWDNATION_MASTER_WALLET
  - STAKING_WALLET

- [ ] **Raise target set** (default 100, can be 10K)

- [ ] **Twitter announcement ready**

- [ ] **Test on devnet first!**

## 🎊 Post-Launch

After successful launch:

1. **Verify LP tokens burned**
   ```bash
   spl-token balance [LP_MINT] --url devnet
   # Should show 0
   ```

2. **Verify liquidity locked**
   - Check Raydium pool
   - Verify LP tokens = 0
   - Test trading works

3. **Announce on Twitter**
   ```
   🎊 CLAWDNATION IS LIVE!

   💰 Raised: [X] SOL from community
   💎 80% in LP (LOCKED FOREVER)
   🔥 LP tokens BURNED
   ✅ Trade now on Raydium!

   #ClawdNation #Solana
   ```

4. **Update documentation**
   - Pool address
   - LP mint address
   - Final raise amount
   - SOL distribution

## 🆘 Troubleshooting

### "Insufficient SOL for LP"

- Check treasury wallet has enough SOL
- Verify 80% calculation is correct
- Ensure bootstrap is actually complete

### "Cannot create LP"

- Verify authority wallet has 400M CLWDN
- Check Raydium is accessible
- Try Raydium UI manually as backup

### "LP tokens not burning"

```bash
# Find accounts manually
spl-token accounts [LP_MINT] --url devnet

# Burn each one
spl-token burn [ACCOUNT_1] ALL --url devnet
spl-token burn [ACCOUNT_2] ALL --url devnet
```

### "Script stuck on burning"

- Answer "yes" to continue (lowercase)
- Or "y" also works
- Must confirm burn to proceed

## 📚 Learn More

- **Bootstrap Program**: `/bootstrap/programs/bootstrap/src/lib.rs`
- **Dispenser Program**: `/dispenser/programs/dispenser/src/lib.rs`
- **Tokenomics Config**: `factory-tokenomics.js`
- **Deployment Log**: `deployment-log.json`

## 🎓 Key Concepts

### Why 80/10/10?

- **80% LP**: Majority locked for trading
- **10% Protocol**: Sustains ClawdNation operations
- **10% Staking**: Rewards long-term holders

### Why Progressive LP?

- **Early trading**: Price discovery during bootstrap
- **No team capital**: Community provides everything
- **Fair launch**: Everyone gets same bootstrap rate

### Why Burn LP Tokens?

- **Permanent lock**: No one can remove liquidity
- **Anti-rug**: Protects community investment
- **Trustless**: Code enforces security

---

**Ready to launch?**

```bash
node launch.js --bootstrap --raise-target 100
```

**Questions?** Check the troubleshooting section or test on devnet first!

*Generated for CLAWDNATION devnet deployment*
