# 🔑 NEW DISPENSER DEPLOYMENT - AUTHORITIES

**Date:** 2026-02-02
**Action:** Deploying fresh dispenser program with known authorities

---

## 📋 WALLET ASSIGNMENTS

### Main Authority (Cold Wallet)
```
Address: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
Keypair: ~/.config/solana/id.json
Role: Dispenser program authority
Permissions:
  - Initialize dispenser
  - Add/remove operators
  - Pause/unpause dispenser
  - Update rate limits
  - Transfer authority
```

### Hot Operator (24/7 Service)
```
Address: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87 (SAME as authority for now)
Keypair: ~/.config/solana/id.json
Role: Dispenser operator (CLWDN distribution)
Permissions:
  - Add recipients
  - Distribute CLWDN
  - Run dispenser service

Note: For production, use SEPARATE hot wallet for operator
```

### Optional: Dedicated Hot Wallet (Production Recommended)
```
Address: TBD (create separate wallet for production)
Keypair: ~/.config/solana/dispenser-hot-wallet.json
Role: Limited operator (distribution only)
Permissions: Distribution only, NO admin powers
```

---

## 🆔 PROGRAM IDS

### OLD Dispenser (Abandoned)
```
Program ID: AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ
Status: ❌ ABANDONED (unknown authority wallet)
Reason: Cannot access operator authorization
```

### NEW Dispenser (Clean Deploy)
```
Program ID: 5ZrZDAEWC6rK4PU3QWndUoKofmLnEAEE4EciDdhn4pBx
Keypair: target/deploy/dispenser-keypair-new.json
Seed Phrase: hat woman best brain sponsor snake cost assume bleak fatigue insane bamboo
Authority: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87 (YOUR wallet)
Status: ✅ READY TO DEPLOY
```

---

## 🎯 DEPLOYMENT PLAN

### Step 1: Update Program ID in Code
```bash
# Update lib.rs declare_id!()
# OLD: declare_id!("AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ");
# NEW: declare_id!("5ZrZDAEWC6rK4PU3QWndUoKofmLnEAEE4EciDdhn4pBx");
```

### Step 2: Update Anchor.toml
```toml
[programs.devnet]
dispenser = "5ZrZDAEWC6rK4PU3QWndUoKofmLnEAEE4EciDdhn4pBx"
```

### Step 3: Build Program (or Use Existing Binary)
```bash
# Try to build (may fail due to blake3)
anchor build

# If build fails, use existing binary from target/deploy/dispenser.so
```

### Step 4: Deploy to Devnet
```bash
solana program deploy \
  target/deploy/dispenser.so \
  --program-id target/deploy/dispenser-keypair-new.json \
  --url devnet
```

### Step 5: Initialize Dispenser with YOUR Wallet
```bash
# Create init script that uses id.json as authority
node init-dispenser-new.js
```

### Step 6: Update All Scripts
Scripts to update with new program ID:
- fix-dispenser-operator.js
- add-dispenser-operator.js
- dispenser-service.js
- e2e-test-bootstrap.js
- Any other scripts referencing dispenser

---

## 🔐 SECURITY MODEL (NEW Dispenser)

### At Initialization:
```
Authority: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
Operators: [HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87] (authority auto-added)
```

### After Initialization:
```
Authority: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87 (unchanged)
Operators: [
  HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87, (main wallet)
  <optional: add dedicated hot wallet>
]
```

### For Production (Mainnet):
```
Authority: <COLD WALLET - offline storage>
Operators: [
  <HOT WALLET 1 - primary service>,
  <HOT WALLET 2 - backup service>,
  <HOT WALLET 3 - emergency operator>
]
```

---

## ✅ VERIFICATION COMMANDS

### After Deployment:
```bash
# Check program deployed
solana program show 5ZrZDAEWC6rK4PU3QWndUoKofmLnEAEE4EciDdhn4pBx --url devnet

# Check your wallet address
solana address -k ~/.config/solana/id.json
# Should output: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
```

### After Initialization:
```bash
# Check dispenser operator status
node fix-dispenser-operator.js
# Should show: ✅ STATUS: ALREADY AUTHORIZED
```

### Start Dispenser Service:
```bash
# Should work without errors!
node dispenser-service.js --network devnet
# Should see: ✅ Distributing CLWDN... (no auth errors)
```

---

## 📝 FILES TO UPDATE

### Code Files:
1. `programs/dispenser/src/lib.rs` - Update declare_id!()
2. `Anchor.toml` - Update program ID

### Script Files (Replace OLD program ID → NEW program ID):
```
OLD: AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ
NEW: 5ZrZDAEWC6rK4PU3QWndUoKofmLnEAEE4EciDdhn4pBx
```

Files to update:
- ✅ fix-dispenser-operator.js
- ✅ add-dispenser-operator.js
- ✅ dispenser-service.js
- ✅ e2e-test-bootstrap.js
- ✅ e2e-test-no-bootstrap.js (if exists)
- ✅ Any bootstrap/factory scripts that reference dispenser

---

## 🚀 NEXT STEPS

1. ✅ Generate new program keypair (DONE)
2. ⏳ Update lib.rs with new program ID
3. ⏳ Update Anchor.toml
4. ⏳ Build (or use existing binary)
5. ⏳ Deploy to devnet
6. ⏳ Create init script
7. ⏳ Initialize with YOUR wallet
8. ⏳ Update all scripts
9. ⏳ Test dispenser service
10. ⏳ Run E2E tests

---

**Ready to proceed with deployment!**

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
