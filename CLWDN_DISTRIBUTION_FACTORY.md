# CLWDN Distribution via Factory System

## Overview

ClawdNation uses a proven **factory-style vesting system** for ALL token distributions:

- ✅ **Same approach** for tokens created via factory AND for CLWDN itself
- ✅ **Simple off-chain tracking** via `vesting.json` files
- ✅ **Gas-efficient** monthly claims
- ✅ **Battle-tested** on existing token launches
- ✅ **Easy to audit** (just read the JSON file)

---

## Why This Approach?

### ❌ What We're NOT Doing

**Complex on-chain vesting contracts:**
- Expensive to deploy and maintain
- More attack surface
- Difficult to upgrade
- High gas costs per claim
- Requires separate contracts per allocation

### ✅ What We ARE Doing

**Factory-style off-chain tracking:**
- Simple JSON file tracking
- Single claim function for all allocations
- Already proven with token factory (70%/10%/10%/10% split)
- Minimal gas costs
- Easy to verify and audit
- Same UX for everyone

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│           ClawdNation Factory System                      │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────┐      ┌──────────────────────┐  │
│  │  Token Factory      │      │  CLWDN Distribution  │  │
│  │  (Other Projects)   │      │  (Our Own Token)     │  │
│  └─────────────────────┘      └──────────────────────┘  │
│           │                              │                │
│           ├─ 70% Liquidity               ├─ Team (150M)  │
│           ├─ 10% Creator (12m vest) ──┐  ├─ Staking(150M)│
│           ├─ 10% Treasury              │  ├─ Community   │
│           └─ 10% Burn                  │  ├─ Treasury    │
│                                         │  └─ Development │
│                                         │                 │
│           SAME VESTING LOGIC ───────────┘                │
│           (vesting.json + claimVesting())                │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## CLWDN Tokenomics (1B Total Supply)

| Allocation | Amount | Vesting | Claim Method |
|------------|--------|---------|--------------|
| **Bootstrap** | 200M (20%) | Immediate via Dispenser | Auto-distribution |
| **Liquidity Pool** | 250M (25%) | Immediate | LP creation |
| **Staking Rewards** | 150M (15%) | **4 years linear** | `claimVesting('staking')` |
| **Team** | 150M (15%) | **2 years linear** | `claimVesting('team')` |
| **Community/Airdrops** | 100M (10%) | Manual | Governance approval |
| **Treasury** | 100M (10%) | Governance | Governance approval |
| **Development** | 50M (5%) | As needed | Governance approval |

**Vested Allocations:**
- Team: 150M ÷ 24 months = **6.25M CLWDN/month**
- Staking: 150M ÷ 48 months = **3.125M CLWDN/month**

---

## Implementation

### Step 1: Initialize Vesting

```bash
cd solana
node clwdn-vesting-factory.js --init
```

**What it does:**
- Creates `clwdn-vesting.json` with all allocations
- Sets start date to now
- Calculates monthly unlock amounts

**Output:**
```json
{
  "allocations": [
    {
      "id": "team",
      "category": "Team",
      "totalAmount": 150000000,
      "claimedAmount": 0,
      "vestingMonths": 24,
      "monthlyUnlock": 6250000,
      "startDate": "2026-02-02T...",
      "status": "active"
    },
    {
      "id": "staking",
      "category": "Staking Rewards",
      "totalAmount": 150000000,
      "claimedAmount": 0,
      "vestingMonths": 48,
      "monthlyUnlock": 3125000,
      "startDate": "2026-02-02T...",
      "status": "active"
    },
    ...
  ]
}
```

### Step 2: View Vesting Status

```bash
# View all allocations
node clwdn-vesting-factory.js --status

# View specific allocation
node clwdn-vesting-factory.js --status team
```

**Output:**
```
═══════════════════════════════════════════════════════
   CLWDN Vesting Status
═══════════════════════════════════════════════════════

📊 TEAM (team)
   Total: 150,000,000 CLWDN
   Claimed: 0 CLWDN
   Remaining: 150,000,000 CLWDN
   Vesting: 24 months (6,250,000 CLWDN/month)
   Progress: 1/24 months
   Unlocked: 6,250,000 CLWDN
   Claimable: 6,250,000 CLWDN
   Recipient: [wallet address]
   Status: active

📊 STAKING REWARDS (staking)
   Total: 150,000,000 CLWDN
   Claimed: 0 CLWDN
   Remaining: 150,000,000 CLWDN
   Vesting: 48 months (3,125,000 CLWDN/month)
   Progress: 1/48 months
   Unlocked: 3,125,000 CLWDN
   Claimable: 3,125,000 CLWDN
```

### Step 3: Claim Vested Tokens

```bash
# Claim team allocation
node clwdn-vesting-factory.js --claim team --wallet <TEAM_WALLET>

# Claim staking rewards
node clwdn-vesting-factory.js --claim staking --wallet <STAKING_PROGRAM>
```

**What happens:**
1. Calculates months elapsed since start
2. Calculates total unlocked = months * monthlyUnlock
3. Calculates claimable = unlocked - previouslyClaimed
4. Transfers CLWDN from authority to recipient
5. Updates `clwdn-vesting.json` with new claimedAmount

**Output:**
```
💰 Claiming vesting for: team
   Category: Team
   Progress: 3/24 months
   Total unlocked: 18,750,000 CLWDN
   Previously claimed: 12,500,000 CLWDN
   Claimable now: 6,250,000 CLWDN

   Transferring from authority: [ATA]
   To recipient: [ATA]
   ✅ Transfer complete! Signature: [tx]

✅ Claim successful!
{
  "allocation": "team",
  "category": "Team",
  "claimed": 6250000,
  "totalClaimed": 18750000,
  "remaining": 131250000,
  "progress": "3/24 months",
  "nextUnlock": "2026-05-02T...",
  "txSignature": "[signature]"
}
```

---

## Integration with Governance

After SPL Governance migration, update recipients:

```javascript
// In clwdn-vesting.json
{
  "allocations": [
    {
      "id": "team",
      "recipient": "[TEAM_GOVERNANCE_ADDRESS]", // Multi-sig
      ...
    },
    {
      "id": "staking",
      "recipient": "[STAKING_PROGRAM_AUTHORITY]", // On-chain program
      ...
    }
  ]
}
```

**Claim Flow with Governance:**
1. **Time passes** → Tokens unlock automatically
2. **Council creates proposal**: "Claim Team Vesting"
3. **Council votes** (3 of 5 approval)
4. **Governance executes**: `claimVesting('team', TEAM_GOVERNANCE)`
5. **Tokens distributed** to governance-controlled wallet

---

## Comparison: Factory vs CLWDN

### Token Factory (for other projects)

```javascript
// token-factory.js
const SPLIT = {
  liquidity: 70,  // → Raydium pool
  creator: 10,    // → 12-month linear vest
  treasury: 10,   // → ClawdNation treasury
  burn: 10,       // → Burned at mint
};

// Creator claims monthly
claimVesting(mintAddress, creatorWallet);
```

### CLWDN Distribution (our token)

```javascript
// clwdn-vesting-factory.js
const TOKENOMICS = {
  bootstrap: 200M,   // → Dispenser (immediate)
  liquidity: 250M,   // → Raydium (immediate)
  team: 150M,        // → 24-month linear vest
  staking: 150M,     // → 48-month linear vest
  community: 100M,   // → Manual (governance)
  treasury: 100M,    // → Governance controlled
  development: 50M,  // → As needed
};

// Team/staking claim monthly
claimVesting('team', teamWallet);
claimVesting('staking', stakingProgram);
```

**Same underlying logic, different parameters!**

---

## Security Considerations

### ✅ Advantages

1. **Simple audit**: Just read `clwdn-vesting.json`
2. **No smart contract risk**: No on-chain vesting logic to exploit
3. **Gas efficient**: Only gas cost is the token transfer
4. **Flexible**: Can adjust allocations before first claim
5. **Proven**: Already works for factory tokens

### ⚠️ Trust Assumptions

1. **Authority holds tokens**: Authority wallet must hold all unvested tokens
2. **Off-chain tracking**: Vesting schedule is not enforced on-chain
3. **Governance required**: Authority should be multi-sig after migration

**Mitigation:**
- Transfer authority to SPL Governance (3 of 5 multi-sig)
- Publish `clwdn-vesting.json` publicly (GitHub, IPFS)
- Monthly transparency reports showing claims vs schedule
- Community can verify: "Has team claimed more than allowed?"

---

## Monthly Operations

### Month 1 (After Launch)

```bash
# Check claimable amounts
node clwdn-vesting-factory.js --status

# Team claims (6.25M CLWDN)
node clwdn-vesting-factory.js --claim team

# Staking rewards distributed (3.125M CLWDN)
node clwdn-vesting-factory.js --claim staking

# Community airdrop (manual, governance approval)
# [Governance creates proposal to distribute X CLWDN to airdrop recipients]
```

### Month 12 (1 year later)

```bash
# Status check
node clwdn-vesting-factory.js --status

# Team: 12/24 months complete (75M CLWDN claimed, 75M remaining)
# Staking: 12/48 months complete (37.5M CLWDN claimed, 112.5M remaining)
```

### Month 24 (2 years later)

```bash
# Team vesting COMPLETE (150M fully claimed)
# Staking: 24/48 months (75M claimed, 75M remaining)
```

### Month 48 (4 years later)

```bash
# All vesting complete! 🎉
# Team: 150M CLWDN (100%)
# Staking: 150M CLWDN (100%)
```

---

## FAQ

### Q: Why not use on-chain vesting contracts?

**A:** We already have a proven off-chain system from the token factory. Why reinvent the wheel? The factory has successfully vested tokens for creators, and it's:
- Simpler (no contract deployment)
- Cheaper (no gas for contract calls)
- Easier to audit (just read JSON)
- More flexible (can adjust before first claim)

### Q: What if the authority rugpulls before vesting completes?

**A:** After governance migration, the authority will be a 3-of-5 multi-sig (SPL Governance). No single person can move funds. Also:
- Vesting schedule is public in GitHub
- Community monitors monthly claims
- Any deviation triggers alarm

### Q: Can we change vesting schedules later?

**A:** Before first claim: Yes, just edit `clwdn-vesting.json`. After first claim: Technically yes, but would be visible to community and require governance approval.

### Q: How does staking program claim from vesting?

**A:** The staking program authority (or governance controlling it) calls `claimVesting('staking')` monthly to unlock tokens, then distributes them to stakers according to staking rules.

### Q: What if we want to accelerate vesting?

**A:** Create governance proposal: "Accelerate Team Vesting to 12 Months". If approved, update `vestingMonths` in JSON and recalculate `monthlyUnlock`. Transparency is maintained via proposal.

---

## Integration with Existing Systems

### Bootstrap → Dispenser (Already Working)

```
User contributes SOL → Bootstrap records allocation → Dispenser auto-sends CLWDN
```

No vesting needed, immediate distribution. ✅ Already complete.

### Liquidity Pool (Already Working)

```
Create Raydium CPMM pool with 250M CLWDN + SOL
```

No vesting, immediate LP creation. ✅ Can be done anytime.

### Team + Staking (New: Vesting Factory)

```
Initialize vesting → Wait 1 month → Claim monthly unlock → Distribute
```

Uses the exact same logic as factory token creator vesting. ✅ **This document.**

### Community Airdrops (Manual)

```
Governance proposal → Vote → Distribute from community allocation
```

No time-based vesting, just governance approval. ✅ Simple transfers.

---

## Summary

**ClawdNation uses ONE proven vesting system for everything:**

1. **Token Factory**: Creator gets 10% vested over 12 months
2. **CLWDN Team**: Gets 15% (150M) vested over 24 months
3. **CLWDN Staking**: Gets 15% (150M) vested over 48 months

**Same code, same logic, same UX. Just different parameters.**

This approach:
- ✅ Reduces complexity
- ✅ Uses battle-tested code
- ✅ Easy to understand for community
- ✅ Consistent with factory identity
- ✅ Simple to audit

**Next Steps:**
1. Run `node clwdn-vesting-factory.js --init` to initialize
2. Publish `clwdn-vesting.json` to GitHub for transparency
3. After governance migration, update recipients to multi-sig addresses
4. Set up monthly cron job for automated status reports
5. Community verifies claims match schedule

---

**Status**: ✅ Ready to deploy
**Network**: Devnet (test first)
**Integration**: Works alongside existing Bootstrap/Dispenser
**Governance**: Compatible with SPL Governance migration
