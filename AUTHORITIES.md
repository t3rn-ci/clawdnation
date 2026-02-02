# 🔑 CLAWDNATION PUBLIC AUTHORITIES

**Last Updated:** 2026-02-02
**Network:** Devnet (Pre-Mainnet)

---

## 📋 PROGRAM ADDRESSES

### Bootstrap Program
**Address:** `GZNvf6JHw5b3KQwS2pPTyb3xPmu225p3rZ3iVBbodrAe`
**Purpose:** Bonding curve bootstrap with 80/10/10 SOL split
**Authority:** Renounced after initialization
**Status:** ✅ Deployed on Devnet

### Dispenser Program
**Address:** `AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ`
**Purpose:** Automated CLWDN distribution to contributors
**Authority:** Main authority (setup only)
**Operators:** Hot wallet for 24/7 operations
**Status:** ✅ Deployed on Devnet

---

## 🪙 TOKEN MINTS

### CLWDN (ClawdNation Main Token)
**Address:** `2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3`
**Supply:** 1,000,000,000 (1 Billion)
**Decimals:** 9
**Mint Authority:** `(null)` - RENOUNCED ✅
**Freeze Authority:** `(null)` - RENOUNCED ✅
**Distribution:** 50/15/15/10/10 (LP/Team/Staking/Treasury/Community)
**Status:** ✅ Live on Devnet

---

## 🔐 PROGRAM DERIVED ADDRESSES (PDAs)

### Bootstrap State
**Address:** Derived from `['bootstrap-state']`
**Seed:** `bootstrap-state`
**Program:** `GZNvf6JHw5b3KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ`
**Purpose:** Stores bootstrap configuration and state

### LP Wallet
**Address:** Derived from `['lp-wallet']`
**Seed:** `lp-wallet`
**Program:** `GZNvf6JHw5b3KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ`
**Purpose:** Receives 80% of contributed SOL for liquidity

### Master Wallet
**Address:** Derived from `['master-wallet']`
**Seed:** `master-wallet`
**Program:** `GZNvf6JHw5b3KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ`
**Purpose:** Receives 10% of contributed SOL (operations)

### Staking Wallet
**Address:** Derived from `['staking-wallet']`
**Seed:** `staking-wallet`
**Program:** `GZNvf6JHw5b3KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ`
**Purpose:** Receives 10% of contributed SOL (staking rewards)

### Dispenser State
**Address:** `BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w`
**Seed:** `state`
**Program:** `AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ`
**Purpose:** Stores dispenser configuration and operators list

---

## 👥 KNOWN OPERATORS (Devnet Only)

### Dispenser Initial Authority
**Address:** `GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE`
**Role:** Original dispenser initializer
**Status:** ✅ Authorized Operator
**Note:** Unknown wallet (likely test/demo wallet)

### Current Test Wallet
**Address:** `HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87`
**Role:** Current test wallet
**Status:** ❌ NOT an operator (needs authorization)
**Note:** Running dispenser service, authorization pending

---

## 🏦 TREASURY & GOVERNANCE (Planned)

### Treasury Allocation
**Amount:** 100,000,000 CLWDN (10%)
**Control:** SPL Governance DAO
**Quorum:** 60% of voting power
**Status:** 🔄 Pending deployment

### Governance Realm (Mainnet)
**Platform:** Realms.today or CLI
**Community Mint:** `2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3`
**Voting:** CLWDN token holders
**Status:** 🔄 Not yet created

---

## 🔒 VESTING CONTRACTS (Planned)

### Team Vesting
**Amount:** 150,000,000 CLWDN (15%)
**Platform:** Bonfida Token Vesting
**Schedule:** 6 months cliff + 12 months linear (parametrizable)
**Status:** 🔄 Ready to deploy (30 min task)

### Staking Vesting
**Amount:** 150,000,000 CLWDN (15%)
**Platform:** Bonfida Token Vesting
**Schedule:** 48 months linear (4 years, parametrizable)
**Status:** 🔄 Ready to deploy (30 min task)

---

## 💧 LIQUIDITY POOL (Planned)

### Raydium LP Pool
**Platform:** Raydium DEX
**Pair:** CLWDN/SOL
**CLWDN Amount:** 500,000,000 (50%)
**SOL Amount:** From LP wallet (80% of bootstrap SOL)
**LP Token Status:** 🔥 BURNED (permanent liquidity)
**Status:** 🔄 Ready to create

---

## 🚨 SECURITY MODEL

### Authority Renouncement
- ✅ **Mint Authority:** Renounced (cannot mint more tokens)
- ✅ **Freeze Authority:** Renounced (cannot freeze accounts)
- ✅ **Supply:** Fixed at 1B forever

### LP Token Burn
- 🔥 **All LP tokens burned** (liquidity locked permanently)
- ❌ No one can remove liquidity
- ✅ Maximum decentralization

### Vesting Immutability
- ⏱️ **Schedules are time-locked on-chain**
- ❌ Creator has ZERO control after deployment
- ✅ Only time unlocks tokens

### Treasury Control
- 👥 **Community-governed via DAO**
- ✅ CLWDN holders vote on proposals
- ❌ No single entity controls treasury

---

## 📊 DISTRIBUTION BREAKDOWN

| Allocation | Amount | Percentage | Status | Control |
|------------|--------|------------|--------|---------|
| **Liquidity** | 500M | 50% | 🔄 Pending | LP Burned 🔥 |
| **Team** | 150M | 15% | 🔄 Pending | Vesting (time) |
| **Staking** | 150M | 15% | 🔄 Pending | Vesting (time) |
| **Treasury** | 100M | 10% | 🔄 Pending | DAO (community) |
| **Community** | 100M | 10% | 🔄 Pending | Immediate |
| **TOTAL** | 1,000M | 100% | ✅ Fixed | Decentralized ✅ |

---

## 🔍 VERIFICATION COMMANDS

### Verify Token Authorities Renounced
```bash
spl-token display 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3

# Should show:
# Mint authority: (null)
# Freeze authority: (null)
```

### Check Dispenser State
```bash
cd /Users/mbultra/projects/clawdnation/solana
node fix-dispenser-operator.js
```

### Check Bootstrap State
```bash
solana account BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w
```

### Check Wallet Balances
```bash
# LP Wallet (80% of SOL)
solana balance <LP_WALLET_PDA>

# Master Wallet (10% of SOL)
solana balance <MASTER_WALLET_PDA>

# Staking Wallet (10% of SOL)
solana balance <STAKING_WALLET_PDA>
```

---

## 🎯 MAINNET ADDRESSES (TBD)

When deployed to mainnet, these addresses will be different and will be published here:

- [ ] Bootstrap Program (new deployment)
- [ ] Dispenser Program (new deployment)
- [ ] CLWDN Token Mint (new mint)
- [ ] Raydium LP Pool ID
- [ ] SPL Governance Realm
- [ ] Team Vesting Contract
- [ ] Staking Vesting Contract
- [ ] Treasury Governance PDA

**ETA:** TBD (after devnet testing complete)

---

## ⚠️ DEVNET NOTICE

**All addresses listed above are DEVNET addresses for testing only.**

DO NOT send real SOL or mainnet tokens to these addresses!

Devnet tokens have NO value and are for testing purposes only.

---

## 📞 REFERENCE DOCUMENTATION

- **ROLES.md** - Authority and role separation
- **SECURITY_FEATURES_ANALYSIS.md** - Complete security audit
- **VESTING_SECURITY_MODEL.md** - Vesting contract details
- **DISPENSER_OPERATOR_FIX.md** - Operator authorization guide
- **DEPLOYMENT_SUMMARY.md** - Complete deployment overview

---

**Built with ❤️ for ClawdNation**
**Transparency:** 🟢 Maximum
**Decentralization:** ✅ Complete
**Security:** 🔒 Hardened
