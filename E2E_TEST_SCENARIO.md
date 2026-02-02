# 🧪 E2E Test Scenario - Real LP Creation on Devnet

## Overview

This document outlines the complete end-to-end test scenario for creating a REAL Raydium CPMM pool on devnet, burning LP tokens, and verifying everything works.

**Status**: 📋 Ready to Execute
**Network**: Devnet (testnet)
**Risk**: Low (devnet only, no real funds)

---

## 📋 Prerequisites

### 1. Environment Setup

- [x] Raydium SDK installed (`@raydium-io/raydium-sdk-v2`)
- [x] Solana CLI configured for devnet
- [x] Wallet keypair with authority
- [x] Scripts tested in dry-run mode

### 2. Current State (Before Test)

```
LP Wallet: 2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V
Balance: 1.6 SOL ✅
CLWDN Balance: 0 ❌ (needs funding)

CLWDN Mint: 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3
Authority: HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87
```

---

## 🚀 E2E Test Steps

### STEP 1: Fund LP Wallet with CLWDN Tokens

**Goal**: Transfer CLWDN tokens to LP wallet for pool creation

**Commands**:
```bash
# Check current CLWDN supply and authority holdings
spl-token accounts 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 --url devnet

# Calculate required amount (for 1.6 SOL at 40,000 CLWDN/SOL rate)
# 1.6 SOL × 40,000 = 64,000 CLWDN

# Transfer CLWDN to LP wallet
spl-token transfer \
  2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  64000 \
  2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V \
  --url devnet \
  --fund-recipient

# Verify transfer
spl-token balance 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  --owner 2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V \
  --url devnet
```

**Expected Result**:
```
✅ LP Wallet CLWDN Balance: 64,000 CLWDN
```

**Verification**:
- [ ] CLWDN tokens in LP wallet ATA
- [ ] Solana Explorer shows transaction
- [ ] Balance matches expected amount

**Explorer Link**:
```
https://explorer.solana.com/address/2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V?cluster=devnet
```

---

### STEP 2: Run Real LP Creation on Devnet

**Goal**: Create actual Raydium CPMM pool and burn LP tokens

**Command**:
```bash
node solana/create-raydium-lp-real.js
```

**What This Does**:
1. ✅ Checks LP wallet funds
2. ✅ Initializes Raydium SDK
3. ✅ Creates CPMM pool on-chain
4. ✅ Captures pool ID and LP mint
5. ✅ Burns ALL LP tokens
6. ✅ Verifies burn completed
7. ✅ Saves results to JSON

**Expected Output**:
```
╔════════════════════════════════════════════════════════════╗
║         REAL RAYDIUM LP CREATION                           ║
╚════════════════════════════════════════════════════════════╝

🧪 DEVNET MODE - Testing with devnet tokens

📋 CONFIGURATION:
  Network: devnet
  ...

━━━ STEP 1: Check LP Wallet Funds ━━━
  LP Wallet SOL: 1.6000 SOL
  LP Wallet CLWDN: 64,000 CLWDN
  ✅ Funds verified

━━━ STEP 2: Initialize Raydium SDK ━━━
  ✅ Raydium SDK loaded

━━━ STEP 3: Create CPMM Pool ━━━
  Creating pool on-chain...
  ✅ Pool created!
  Transaction: [TX_ID]
  Pool ID: [POOL_ID]
  LP Mint: [LP_MINT]

━━━ STEP 4: Burn LP Tokens ━━━
  LP Balance: [AMOUNT] LP tokens
  🔥 Burning ALL LP tokens...
  ✅ LP tokens burned!
  Transaction: [BURN_TX]

  Verification:
    LP Balance After Burn: 0
    Status: ✅ LOCKED

━━━ STEP 5: Verification ━━━
  Pool Status:
    SOL Reserve: 1.6 SOL
    CLWDN Reserve: 64,000 CLWDN
    LP Supply: 0
    Trading Active: YES

🎉 SUCCESS - LP CREATED AND LOCKED!

  Pool ID: [POOL_ID]
  LP Mint: [LP_MINT]
  Creation TX: [TX_ID]
  Burn TX: [BURN_TX]

  🔒 Pool is permanently locked
  🚀 Trading is now live on Raydium!

  Results saved to: lp-creation-devnet-[TIMESTAMP].json
```

**Verification Checklist**:
- [ ] Pool creation transaction succeeded
- [ ] Pool ID returned
- [ ] LP mint address captured
- [ ] Burn transaction succeeded
- [ ] LP balance = 0 after burn
- [ ] Results JSON file created

**Capture These Values**:
```
Pool ID: _________________________
LP Mint: _________________________
Creation TX: _________________________
Burn TX: _________________________
```

---

### STEP 3: Verify LP Burn On-Chain (3 Methods)

**Goal**: Independently verify that LP tokens were burned and pool is locked

#### Method 1: Solana Explorer (Visual)

**Steps**:
1. Open: `https://explorer.solana.com/address/[LP_MINT]?cluster=devnet`
2. Check the following:

**Expected Values**:
```
Supply: 0 ✅
Decimals: 9
Mint Authority: None ✅
Freeze Authority: None ✅
```

**Verification**:
- [ ] Supply = 0 (all LP burned)
- [ ] Mint Authority = None (cannot mint more)
- [ ] Freeze Authority = None (cannot freeze)

#### Method 2: Solana CLI

**Commands**:
```bash
# Check LP token supply
spl-token supply [LP_MINT] --url devnet
# Expected: 0

# Get detailed mint info
spl-token display [LP_MINT] --url devnet
# Expected:
#   Supply: 0
#   Mint authority: (not set)
#   Freeze authority: (not set)
```

**Verification**:
- [ ] `spl-token supply` returns 0
- [ ] Mint authority is not set
- [ ] Freeze authority is not set

#### Method 3: RPC Query (Programmatic)

**Script**: `verify-lp-burn.js`

```javascript
const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

async function verifyBurn() {
  const conn = new Connection('https://api.devnet.solana.com');
  const lpMint = new PublicKey('YOUR_LP_MINT_HERE');

  const mintInfo = await getMint(conn, lpMint);

  console.log('LP Mint Verification:');
  console.log('  Supply:', Number(mintInfo.supply));
  console.log('  Mint Authority:', mintInfo.mintAuthority);
  console.log('  Freeze Authority:', mintInfo.freezeAuthority);

  if (Number(mintInfo.supply) === 0 && mintInfo.mintAuthority === null) {
    console.log('\n✅ LP TOKENS BURNED - POOL PERMANENTLY LOCKED');
    return true;
  } else {
    console.log('\n⚠️  LP tokens NOT fully burned or mint authority exists');
    return false;
  }
}

verifyBurn();
```

**Run**:
```bash
node verify-lp-burn.js
```

**Expected Output**:
```
LP Mint Verification:
  Supply: 0
  Mint Authority: null
  Freeze Authority: null

✅ LP TOKENS BURNED - POOL PERMANENTLY LOCKED
```

**Verification**:
- [ ] Script confirms supply = 0
- [ ] Script confirms no mint authority
- [ ] Returns success status

---

### STEP 4: Verify Pool on Raydium

**Goal**: Confirm pool is visible and tradeable on Raydium UI

**Steps**:

1. **Check Pool Exists**:
   ```
   https://raydium.io/pools/?cluster=devnet
   ```
   Search for pool ID or token pair

2. **Expected Pool Info**:
   ```
   Pool ID: [YOUR_POOL_ID]
   Token A: SOL
   Token B: CLWDN (2poZXLq...)
   SOL Reserve: ~1.6 SOL
   CLWDN Reserve: ~64,000 CLWDN
   Fee: 0.3%
   Status: Active
   ```

**Verification**:
- [ ] Pool appears in Raydium interface
- [ ] Reserves match expected amounts
- [ ] Pool shows as active
- [ ] Swap interface available

---

### STEP 5: Test Small Trade on Pool

**Goal**: Verify pool is functional and trading works

#### Test Trade #1: Buy CLWDN with SOL

**Amount**: 0.01 SOL (small test)

**Command** (using Raydium SDK):
```bash
# Or use Raydium UI manually
```

**Expected**:
- Receive approximately 400 CLWDN (0.01 SOL × 40,000)
- Pool reserves adjust
- Transaction succeeds

**Verification**:
- [ ] Swap transaction succeeded
- [ ] Received expected CLWDN amount
- [ ] Pool reserves updated correctly

#### Test Trade #2: Sell CLWDN for SOL

**Amount**: 100 CLWDN (small test)

**Expected**:
- Receive approximately 0.0025 SOL
- Pool reserves adjust back
- Transaction succeeds

**Verification**:
- [ ] Swap transaction succeeded
- [ ] Received expected SOL amount
- [ ] Pool still active after trade

---

### STEP 6: Final Verification - Pool Locked Status

**Goal**: Confirm pool cannot be manipulated after LP burn

**Tests**:

1. **Attempt to Remove Liquidity** (should fail):
   ```
   ❌ Expected: No option to remove liquidity
   ❌ Expected: No LP tokens available to redeem
   ```

2. **Check LP Supply Again**:
   ```bash
   spl-token supply [LP_MINT] --url devnet
   # Should still be 0
   ```

3. **Verify Pool Reserves Unchanged** (except for trades):
   ```
   SOL: Should only change due to trading
   CLWDN: Should only change due to trading
   ```

**Verification**:
- [ ] Cannot remove liquidity
- [ ] LP supply still 0
- [ ] Pool reserves only change from trading
- [ ] No way to unlock pool

---

## 📊 Test Results Template

### Test Execution Record

**Date**: _______________
**Tester**: _______________
**Network**: Devnet

### Results Summary

| Step | Status | Notes |
|------|--------|-------|
| 1. Fund LP Wallet | ⬜ | |
| 2. Create Pool | ⬜ | |
| 3. Verify Burn (Explorer) | ⬜ | |
| 4. Verify Burn (CLI) | ⬜ | |
| 5. Verify Burn (RPC) | ⬜ | |
| 6. Verify on Raydium | ⬜ | |
| 7. Test Buy Trade | ⬜ | |
| 8. Test Sell Trade | ⬜ | |
| 9. Verify Pool Locked | ⬜ | |

### Captured Values

```
Pool ID: _________________________
LP Mint: _________________________
Creation TX: _________________________
Burn TX: _________________________
Buy Trade TX: _________________________
Sell Trade TX: _________________________

LP Supply After Burn: _________
SOL Reserve: _________
CLWDN Reserve: _________
```

### Issues Encountered

```
(List any issues or unexpected behavior)
```

### Final Status

- [ ] All steps completed successfully
- [ ] LP burn verified by all 3 methods
- [ ] Pool trading works
- [ ] Pool is permanently locked
- [ ] Ready for mainnet consideration

---

## 🚨 Troubleshooting

### Issue: Insufficient CLWDN in LP Wallet

**Solution**:
```bash
# Check authority CLWDN balance
spl-token accounts 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 --url devnet

# Transfer from authority to LP wallet
spl-token transfer [MINT] [AMOUNT] [LP_WALLET] --url devnet --fund-recipient
```

### Issue: Pool Creation Fails

**Check**:
1. LP wallet has enough SOL for transaction fees
2. LP wallet has CLWDN tokens
3. Raydium program is accessible on devnet
4. Authority has signing rights

**Debug**:
```bash
# Check LP wallet balance
solana balance [LP_WALLET] --url devnet

# Check logs
node solana/create-raydium-lp-real.js 2>&1 | tee debug.log
```

### Issue: LP Burn Verification Shows Non-Zero

**Action**: 🚨 DO NOT PROCEED TO MAINNET
**Investigation**:
1. Check burn transaction logs
2. Verify burn instruction executed
3. Check LP token account balances
4. Review script output for errors

### Issue: Trading Fails on Pool

**Possible Causes**:
1. Insufficient liquidity (should not happen)
2. Pool not initialized correctly
3. Slippage too low
4. Devnet network issues

**Solutions**:
- Increase slippage tolerance
- Check pool state on-chain
- Retry after waiting
- Review Raydium UI for errors

---

## 📝 Success Criteria

### For Devnet Test to Pass:

- [x] All unit tests passing (37/37) ✅
- [ ] LP wallet funded with CLWDN
- [ ] Pool created successfully on-chain
- [ ] LP mint address captured
- [ ] All LP tokens burned (supply = 0)
- [ ] Burn verified by all 3 methods
- [ ] Pool visible on Raydium
- [ ] Buy trade executes successfully
- [ ] Sell trade executes successfully
- [ ] Pool remains locked after trades
- [ ] No way to remove liquidity

### For Mainnet Readiness:

- [ ] Devnet test passed ✅
- [ ] LP burn verified by community
- [ ] Trading tested multiple times
- [ ] No issues encountered
- [ ] Documentation reviewed
- [ ] Mainnet parameters confirmed
- [ ] Safety warnings acknowledged
- [ ] Team approval obtained

---

## 🎯 Next Actions After Successful Test

1. **Document Results**:
   - Fill in test results template
   - Save all transaction IDs
   - Screenshot verification steps
   - Note any issues or observations

2. **Review with Team**:
   - Share test results
   - Discuss any concerns
   - Confirm readiness for mainnet

3. **Prepare for Mainnet**:
   - Set mainnet environment variables
   - Review mainnet parameters
   - Plan deployment timing
   - Prepare community announcement

4. **Execute Mainnet Deployment**:
   ```bash
   # With 10-second safety warning
   MAINNET_CLWDN_MINT=[mainnet_mint] \
   MAINNET_LP_WALLET=[mainnet_lp_wallet] \
   node solana/create-raydium-lp-real.js --mainnet
   ```

5. **Verify on Mainnet**:
   - Repeat all verification steps
   - Use mainnet explorer links
   - Announce to community with verification links

---

## 📞 Support

**If you encounter issues**:

1. Check troubleshooting section above
2. Review error messages carefully
3. Check Solana devnet status
4. Consult Raydium documentation
5. Reach out to team

**Useful Links**:
- Solana Explorer: https://explorer.solana.com/?cluster=devnet
- Raydium Pools: https://raydium.io/pools/?cluster=devnet
- SPL Token CLI: https://spl.solana.com/token
- Verification Guide: `LP_BURN_VERIFICATION.md`

---

**Last Updated**: 2026-02-02
**Version**: 1.0
**Status**: 📋 Ready to Execute
