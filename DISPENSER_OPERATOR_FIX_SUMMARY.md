# 🚨 DISPENSER OPERATOR FIX - ACTION REQUIRED

**Problem:** Dispenser service failing with "Unauthorized: not an operator" error

**Date:** 2026-02-02
**Priority:** 🔴 CRITICAL (blocks CLWDN distributions)

---

## 📊 CURRENT SITUATION

### Dispenser Authority (Unknown Wallet)
```
Address: GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE
Status: Has full dispenser authority
Found in:
  - token-meta JSON files (as creator address)
  - index.html (as payment address)
  - serve.js (as PAYMENT_WALLET)
  - twitter/bot.js (as PAYMENT_ADDRESS)
  - e2e-local.js (as ACTUAL_TREASURY)

Issue: We don't have the private key for this wallet
```

### Current Wallet
```
Address: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
Source: ~/.config/solana/id.json
Status: ❌ NOT an operator
```

### Why Auto-Fix Failed
1. ❌ `add_operator` requires EXISTING operator to call it (catch-22)
2. ❌ Can't build Anchor IDL (blake3 dependency error)
3. ❌ Can't find original wallet private key
4. ❌ No close/reset instruction in dispenser program

---

## 🎯 SOLUTIONS (Pick One)

### Option 1: Locate the Original Wallet ⭐ RECOMMENDED
The wallet `GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE` appears in your codebase as:
- Payment address
- Treasury address
- Creator address

**Action Required:**
1. Check if you have this wallet's keypair somewhere:
   ```bash
   # Search for the wallet in all JSON files
   find ~ -name "*.json" -type f 2>/dev/null | xargs grep -l "GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE" 2>/dev/null
   ```

2. If found, use it to add current wallet as operator:
   ```bash
   AUTHORITY_KEYPAIR=/path/to/GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE.json \
   node add-dispenser-operator.js \
   --operator=HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
   ```

### Option 2: Deploy NEW Dispenser Program
Deploy a fresh dispenser program with current wallet as authority.

**Steps:**
```bash
# 1. Navigate to dispenser directory
cd /Users/mbultra/projects/clawdnation/dispenser

# 2. Generate new program keypair
solana-keygen new -o target/deploy/dispenser-keypair-new.json

# 3. Update Anchor.toml with new program ID
NEW_PROGRAM_ID=$(solana address -k target/deploy/dispenser-keypair-new.json)
echo "New dispenser program: $NEW_PROGRAM_ID"

# 4. Update lib.rs declare_id!() with new program ID

# 5. Build (if blake3 error fixed) or skip build and deploy old binary

# 6. Deploy to devnet
solana program deploy \
  target/deploy/dispenser.so \
  --program-id target/deploy/dispenser-keypair-new.json \
  --url devnet

# 7. Initialize with YOUR wallet
# (Write init script if needed)

# 8. Update all scripts to use new program ID
# - fix-dispenser-operator.js
# - dispenser-service.js
# - e2e-test-bootstrap.js
# - etc.
```

**Pros:** Complete control, current wallet is authority
**Cons:** Need to update all scripts with new program ID

### Option 3: Use Existing Operator Wallet (If You Have One)
If you have access to ANY of the existing operators:

```bash
# Check current operators
node fix-dispenser-operator.js

# Use that wallet to add current wallet
AUTHORITY_KEYPAIR=<existing_operator_wallet> \
node add-dispenser-operator.js \
--operator=HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
```

### Option 4: Accept Devnet Lock (Temporary Workaround)
For devnet testing, you could:
1. Accept that dispenser won't work with current setup
2. Skip dispenser-based distributions
3. Test other parts of the system
4. Fix properly before mainnet

**Not recommended** - blocks e2e testing of full flow

---

## ⚡ RECOMMENDED ACTION PLAN

### Step 1: Search for Original Wallet (5 minutes)
```bash
# Search your entire projects directory
cd /Users/mbultra/projects
find . -name "*.json" -type f 2>/dev/null | xargs grep -l "GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE" 2>/dev/null

# Check if it's a Phantom export or other wallet
ls -la ~/Downloads/*.json 2>/dev/null
ls -la ~/Desktop/*.json 2>/dev/null

# Check backup locations
ls -la ~/.config/solana/backup/*.json 2>/dev/null
```

### Step 2: If Found → Add Operator (2 minutes)
```bash
AUTHORITY_KEYPAIR=/path/to/found_wallet.json \
node add-dispenser-operator.js \
--operator=HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87

# Verify fix
node fix-dispenser-operator.js
# Should show: ✅ STATUS: ALREADY AUTHORIZED

# Test dispenser
node dispenser-service.js
# Should work without errors
```

### Step 3: If NOT Found → Deploy New Dispenser (30 minutes)
Follow Option 2 above to deploy fresh dispenser program.

---

## 🔍 DIAGNOSTIC TOOLS CREATED

### `fix-dispenser-operator.js`
Checks if current wallet is authorized operator.

```bash
node fix-dispenser-operator.js
```

**Output:**
- ✅ STATUS: ALREADY AUTHORIZED (you're good!)
- ❌ STATUS: NOT AUTHORIZED (you need to fix it)

**Details shown:**
- Dispenser authority
- Your wallet
- Current operators list
- Solutions

### `add-dispenser-operator.js`
Adds new operator (requires EXISTING operator wallet).

```bash
# Won't work without original wallet:
node add-dispenser-operator.js --operator=<NEW_OPERATOR>

# Will work if you have original wallet:
AUTHORITY_KEYPAIR=<original_wallet> \
node add-dispenser-operator.js --operator=<NEW_OPERATOR>
```

---

## 📋 FILES UPDATED

### New Files Created:
- ✅ `AUTHORITIES.md` - All public addresses
- ✅ `BOOTSTRAP_UPDATES.md` - Compressed knowledge
- ✅ `DISPENSER_OPERATOR_FIX.md` - Detailed fix guide
- ✅ `DISPENSER_OPERATOR_FIX_SUMMARY.md` - This file
- ✅ `fix-dispenser-operator.js` - Diagnostic script

### Files Updated:
- ✅ `e2e-test-bootstrap.js` - Added Step 2: operator check

---

## 🚨 IMPACT OF NOT FIXING

### Blocked Features:
- ❌ Dispenser service won't run
- ❌ CLWDN distributions will fail
- ❌ Bootstrap contributions won't get CLWDN
- ❌ E2E tests will show WARN for operator check

### Still Working:
- ✅ Bootstrap bonding curve (SOL split)
- ✅ Token creation (factory path)
- ✅ LP creation
- ✅ LP burn automation
- ✅ Vesting deployment (ready)

---

## 💡 WHY THIS HAPPENED

The dispenser was initialized with a wallet that:
1. Appears as "payment address" in your codebase
2. Was likely used for early testing
3. Private key was not saved or is in unknown location

This is a **devnet-only issue** - on mainnet you'll initialize with a known, secure wallet.

---

## ✅ PREVENTION FOR MAINNET

Before mainnet launch:

### 1. Document All Wallets
```bash
# Create wallet inventory
echo "Main Authority: $(solana address)" >> MAINNET_WALLETS.md
echo "Hot Operator: <operator_address>" >> MAINNET_WALLETS.md
```

### 2. Backup All Keypairs
```bash
# Encrypted backup
tar -czf mainnet-wallets-backup.tar.gz ~/.config/solana/*.json
gpg --encrypt --recipient <your_email> mainnet-wallets-backup.tar.gz
# Store encrypted backup securely (offline + cloud)
```

### 3. Test Operator Management
```bash
# Add test operator
node add-dispenser-operator.js --operator=<TEST_WALLET>

# Remove test operator
# (create remove script if needed)

# Verify
node fix-dispenser-operator.js
```

### 4. Document Operator Recovery
Create runbook for:
- Adding new operators
- Removing compromised operators
- Emergency operator rotation

---

## 🔗 RELATED DOCUMENTATION

- `DISPENSER_OPERATOR_FIX.md` - Detailed technical guide
- `AUTHORITIES.md` - All public addresses and PDAs
- `ROLES.md` - Authority separation model
- `BOOTSTRAP_UPDATES.md` - Complete system knowledge

---

## 📞 IMMEDIATE NEXT STEP

**Run this command RIGHT NOW:**

```bash
cd /Users/mbultra/projects && \
find . -name "*.json" -type f 2>/dev/null | \
xargs grep -l "GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE" 2>/dev/null
```

**If it finds a keypair file:**
→ Use it with add-dispenser-operator.js

**If it finds NOTHING:**
→ Deploy new dispenser program (Option 2)

---

**Status:** 🔴 BLOCKING
**Priority:** P0 (fix before e2e completion)
**Time to Fix:** 5-30 minutes (depending on option)
**Devnet Only:** Yes (mainnet will be clean deploy)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
