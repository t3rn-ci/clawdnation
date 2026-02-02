# 🔐 CLAWDNATION ROLES & AUTHORITY MODEL

**Critical: Don't mess up the roles!**

This document clarifies which wallets have which roles and authorities across the ClawdNation launch system.

---

## 🔑 WALLET ROLES

### 1. **MAIN AUTHORITY** (Cold Wallet - Secure)
**Purpose:** Main security authority, rarely used

**Has Authority Over:**
- ✅ Bootstrap program (initialize, set parameters)
- ✅ Dispenser program (initialize, manage operators, pause)
- ✅ Token mint (ONLY during creation, then RENOUNCED immediately)
- ✅ Token freeze (ONLY during creation, then RENOUNCED immediately)

**Does NOT:**
- ❌ NOT used for day-to-day operations
- ❌ NOT used for CLWDN distributions
- ❌ NOT an operator after setup (for security)

**Setup:**
```bash
# Main authority stored in:
~/.config/solana/id.json

# Used for:
node factory-no-bootstrap.js  # Create tokens, renounce authorities
node init-bonding-simple.js   # Initialize bootstrap
# Then HANDS OFF - no more authority usage
```

---

### 2. **DISPENSER OPERATOR** (Hot Wallet - Fast)
**Purpose:** Automated CLWDN distribution, quick interactions

**Has Authority Over:**
- ✅ Can call dispense_clawdnation() on bootstrap
- ✅ Can add_recipient() and distribute() on dispenser
- ✅ Works with BOTH bootstrap and factory tokens
- ✅ Runs 24/7 as a service

**Does NOT:**
- ❌ NOT the main authority
- ❌ CANNOT pause dispenser
- ❌ CANNOT manage other operators
- ❌ CANNOT mint tokens

**Setup:**
```bash
# Separate hot wallet for dispenser
DISPENSER_WALLET=<separate_keypair>

# Add as operator:
node add-dispenser-operator.js --operator=$DISPENSER_WALLET

# Run service:
AUTHORITY_KEYPAIR=$DISPENSER_WALLET node dispenser-service.js
```

**Security Model:**
- Holds minimal SOL (for tx fees)
- Can only distribute pre-approved CLWDN
- Cannot steal funds or mint tokens
- Can be rotated if compromised

---

### 3. **TOKEN HOLDER** (Any Wallet)
**Purpose:** CLWDN token ownership, governance voting

**Has Authority Over:**
- ✅ Vote on SPL Governance proposals
- ✅ Transfer their own tokens
- ✅ Receive CLWDN from dispenser

**Does NOT:**
- ❌ CANNOT mint tokens (authority renounced)
- ❌ CANNOT freeze accounts (authority renounced)
- ❌ CANNOT access vested tokens early

---

### 4. **VESTING BENEFICIARY** (Team/Staking)
**Purpose:** Receive vested tokens over time

**Has Authority Over:**
- ✅ Can withdraw UNLOCKED tokens only
- ✅ Can check vesting schedule

**Does NOT:**
- ❌ CANNOT access locked tokens
- ❌ CANNOT modify vesting schedule
- ❌ CANNOT accelerate vesting

**Authority Model:**
- Vesting PDA holds tokens
- Schedule is IMMUTABLE on-chain
- Creator has ZERO control after creation
- See: VESTING_SECURITY_MODEL.md

---

### 5. **TREASURY DAO** (SPL Governance - Community)
**Purpose:** Community-controlled treasury (100M CLWDN)

**Has Authority Over:**
- ✅ Treasury spending (via proposals)
- ✅ Controlled by CLWDN token holders
- ✅ Requires 60% quorum

**Does NOT:**
- ❌ NOT controlled by team
- ❌ NOT controlled by multisig
- ❌ NOT controlled by any single entity

**Setup:**
```bash
# Create governance via CLI or Realms UI:
spl-governance create-realm \
  --name "ClawdNation" \
  --community-mint 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  --community-vote-threshold-percentage 60
```

---

## 🏗️ AUTHORITY FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                     LAUNCH DAY FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MAIN AUTHORITY (Cold Wallet)                               │
│  ├─ 1. Creates token mint                                   │
│  ├─ 2. Distributes 50/15/15/10/10                          │
│  ├─ 3. Renounces mint authority → NULL                     │
│  ├─ 4. Renounces freeze authority → NULL                   │
│  ├─ 5. Creates vesting contracts                           │
│  └─ 6. **DONE - No more authority!**                       │
│                                                              │
│  DISPENSER OPERATOR (Hot Wallet)                            │
│  ├─ Added as operator by Main Authority                    │
│  ├─ Runs 24/7 service                                       │
│  ├─ Distributes CLWDN to contributors                      │
│  └─ Works with both Bootstrap & Factory tokens             │
│                                                              │
│  COMMUNITY (DAO Governance)                                 │
│  ├─ Receives Treasury (100M CLWDN)                         │
│  ├─ Token holders vote on proposals                        │
│  └─ Maximum decentralization ✅                            │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ SECURITY CHECKLIST

### Launch Day (Main Authority):
- [ ] Create token with factory-no-bootstrap.js
- [ ] Verify 50/15/15/10/10 distribution
- [ ] Renounce mint authority (automated in factory script)
- [ ] Renounce freeze authority (automated in factory script)
- [ ] Create Raydium LP
- [ ] Burn ALL LP tokens
- [ ] Deploy vesting contracts (Bonfida)
- [ ] Add dispenser operator (hot wallet)
- [ ] **MAIN AUTHORITY HANDS OFF** ✅

### Day 1-7 (Dispenser Operator):
- [ ] Dispenser service running 24/7
- [ ] Monitoring CLWDN distributions
- [ ] Responding to bootstrap contributions
- [ ] Responding to factory token mints

### Week 1+ (Community):
- [ ] Create SPL Governance Realm
- [ ] Transfer Treasury to DAO
- [ ] Community voting active
- [ ] Full decentralization achieved ✅

---

## 🚨 CRITICAL: AUTHORITY RENOUNCEMENT

**After token creation, IMMEDIATELY verify:**

```bash
# Check token authorities:
spl-token display <MINT_ADDRESS>

# Should show:
# Mint authority: (null)
# Freeze authority: (null)
```

**If authorities are NOT null:**
```bash
# Emergency renouncement:
spl-token authorize <MINT> mint --disable
spl-token authorize <MINT> freeze --disable
```

---

## 🤖 DISPENSER COMPATIBILITY

The dispenser must work with:

### ✅ Bootstrap Contributions (Path 1):
- User sends SOL to bootstrap
- Bootstrap contract triggers 80/10/10 split
- Dispenser detects contribution
- Dispenser calls dispense_clawdnation()
- User receives CLWDN automatically

### ✅ Factory Tokens (Path 2):
- Token created via factory-no-bootstrap.js
- No bootstrap involved
- Dispenser can still distribute CLWDN
- Same hot wallet, same operator permissions

### ✅ Ongoing Bootstraps:
- Multiple tokens can bootstrap simultaneously
- Dispenser handles all contributions
- Each has separate bootstrap state
- Dispenser operator works across all

---

## 📞 ROLE SUMMARY

| Role | Wallet Type | Authority | Usage | Risk |
|------|-------------|-----------|-------|------|
| **Main Authority** | Cold | High (temporary) | Rare | High |
| **Dispenser Operator** | Hot | Low (distribution only) | 24/7 | Low |
| **Token Holder** | Any | Own tokens only | Anytime | None |
| **Vesting Beneficiary** | Any | Unlocked tokens only | Monthly+ | None |
| **DAO Treasury** | Governance PDA | Community vote | Proposals | None |

---

## 🎯 KEY PRINCIPLES

1. **Separation of Powers**
   - Main authority ≠ Dispenser operator
   - Cold storage for security
   - Hot wallet for operations

2. **Time-Limited Authority**
   - Main authority only during setup
   - Then renounced forever
   - No going back ✅

3. **Decentralization**
   - No single point of control
   - Community governs treasury
   - Vesting enforced on-chain

4. **Security First**
   - Authorities renounced
   - LP tokens burned
   - Vesting immutable
   - Dispenser isolated

---

**Built with ❤️ for ClawdNation**
**Security:** 🟢 Maximum
**Decentralization:** ✅ Complete
**Trust:** ❌ Not Required!
