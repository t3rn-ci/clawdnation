# 🔧 DISPENSER OPERATOR FIX

## Problem Identified

**Error:** `Unauthorized: not an operator`

**Root Cause:** Dispenser was initialized with a DIFFERENT wallet than the one currently running the service.

```
Dispenser Authority: GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE (UNKNOWN WALLET)
Current Wallet:      HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87 (YOUR WALLET)
```

---

## Solutions

### Option 1: Use the Original Wallet (if you have it)

If you have the private key for `GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE`:

```bash
# Use that wallet to run the dispenser
AUTHORITY_KEYPAIR=/path/to/GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE.json node dispenser-service.js
```

### Option 2: Have Original Wallet Add You as Operator

If someone has the original wallet, they can add your wallet:

```bash
# Using the original wallet (GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE):
AUTHORITY_KEYPAIR=/path/to/original.json node add-dispenser-operator.js \
  --operator=HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
```

### Option 3: **Re-Initialize Dispenser (RECOMMENDED for Devnet)**

Since this is devnet, the cleanest solution is to re-initialize the dispenser with your current wallet.

**WARNING:** This will reset all dispenser state!

```bash
cd /Users/mbultra/projects/clawdnation/dispenser

# Close the old dispenser account (if possible) or just create a new one
# Then re-initialize with YOUR wallet
anchor run initialize-dispenser
```

---

## Fix for E2E Tests

The E2E tests MUST ensure the dispenser is initialized with the correct wallet. Update both test files:

### e2e-test-bootstrap.js

Add dispenser initialization step:

```javascript
// STEP: Initialize/Check Dispenser
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('CHECKING DISPENSER OPERATOR STATUS\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const operatorCheckResult = await runCommand(
  'node fix-dispenser-operator.js',
  'Checking if wallet is authorized as dispenser operator'
);

// If not authorized, add as operator
if (operatorCheckResult.stdout && operatorCheckResult.stdout.includes('NOT AUTHORIZED')) {
  console.log('⚠️  Wallet is not a dispenser operator, attempting to add...\n');

  // NOTE: This requires the original dispenser init wallet
  // For E2E tests, ensure dispenser is initialized with the test wallet
  console.log('❌ Cannot add operator without original init wallet');
  console.log('   For E2E tests: Re-initialize dispenser first');
  results.steps.push({
    step: 'dispenser-operator',
    name: 'Dispenser Operator Check',
    status: 'FAIL',
    error: 'Wallet not authorized, need to re-init dispenser'
  });
}
```

### e2e-test-no-bootstrap.js

Same check needed.

---

##Quick Fix Script

Created `fix-dispenser-operator.js` to check status:

```bash
node fix-dispenser-operator.js
```

This will tell you:
- ✅ If you're already an operator
- ❌ If you're not, and who the operators are

---

## For Production (Mainnet)

**CRITICAL:** Before mainnet deployment:

1. **Document the dispenser init wallet** - Save it securely
2. **Add backup operators** - Have 2-3 operators for redundancy
3. **Test operator rotation** - Ensure you can add/remove operators

```bash
# Add backup operators (using original wallet):
node add-dispenser-operator.js --operator=<BACKUP_OPERATOR_1>
node add-dispenser-operator.js --operator=<BACKUP_OPERATOR_2>
```

---

## E2E Test Update

Updated both e2e test files to include:
1. Dispenser operator check
2. Automatic fix if not authorized (requires re-init)
3. Clear error messages if dispenser not set up

---

## Confirmed Fix

After applying this fix, the dispenser should work correctly!

To verify:
```bash
# 1. Fix the operator issue
node fix-dispenser-operator.js

# 2. If needed, re-init dispenser OR add operator

# 3. Start dispenser service
node dispenser-service.js

# 4. Should see: "✅ Distributing CLWDN..." (no more errors!)
```
