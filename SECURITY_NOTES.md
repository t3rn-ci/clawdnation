# Security Notes

## devnet-test-wallet.json in Git History

**Status**: COMPROMISED (devnet only)

The file `devnet-test-wallet.json` was committed in commit history and later removed. While it's deleted from HEAD, the private key remains in git history.

**Affected Wallet**: (keypair in early commits)
**Network**: Devnet only
**Risk Level**: LOW (devnet has no real value)

**Action Taken**:
- File removed from current branch
- Added to .gitignore to prevent future commits
- Pattern `*wallet*.json` added to .gitignore

**Recommendation**:
- Consider this devnet wallet compromised
- Do NOT reuse this keypair for mainnet
- For mainnet, use a fresh keypair that has NEVER been committed to git

**Alternative Fix** (not recommended for public repo):
- `git filter-branch` or `BFG Repo-Cleaner` to remove from history
- Requires force push to all branches
- Breaks existing clones

## RPC Proxy Security

**File**: `serve.js`

The `/api/rpc` endpoint is a CORS proxy for Solana RPC calls.

**Security Measures**:
- ✅ READ-ONLY methods whitelist
- ✅ Blocks `sendTransaction`, `simulateTransaction`, `sendRawTransaction`
- ✅ Returns 403 for non-whitelisted methods

**Allowed Methods** (22 total):
- Account queries: getAccountInfo, getBalance, getMultipleAccounts, getProgramAccounts
- Token queries: getTokenAccountBalance, getTokenAccountsByOwner, getTokenLargestAccounts, getTokenSupply
- Blockchain state: getBlockHeight, getSlot, getEpochInfo, getHealth
- Transaction queries: getSignatureStatuses, getTransaction, getTransactionCount
- Misc: getClusterNodes, getInflationReward, getLatestBlockhash, getMinimumBalanceForRentExemption, getRecentBlockhash, getStakeActivation, getSupply, getVersion, getVoteAccounts

**Why This Matters**:
Without the whitelist, attackers could use your server to:
- Send transactions through your RPC endpoint (transaction spam)
- Simulate transactions (resource abuse)
- Use your server as a proxy for malicious activity

## Path Traversal Protection

**File**: `serve.js`

Static file serving blocks sensitive paths.

**Blocked Patterns**:
- Environment files: `.env*`, `.pem`, `.key`
- Git files: `.git*`
- Node modules: `node_modules/`
- Sensitive data: `solana/orders.json`, `solana/vesting.json`, `twitter/processed-tweets.json`
- Scripts: `solana/dispenser-*`, `solana/e2e-*`, `solana/archive/`
- Source code: `bootstrap/`, `dispenser/`, `serve.js`, `package*.json`, `Cargo.*`
- Credentials: `wallet`, `keypair`
- Bot internals: `twitter/bot`

**Protection Methods**:
1. Path traversal check (`..` blocked)
2. Path resolution (must be within project root)
3. Pattern matching (blocked paths list)

**Why This Matters**:
Without path traversal protection, attackers could:
- Access `.env` files with secrets
- Download source code
- Read internal data files
- Potentially find credentials

## Test Coverage

**Current Status**: 37 passing, 0 failing (100% pass rate) 🎉✅

**FIXED (2026-02-02)**: All test failures resolved

### Fix #1: Critical program ID mismatch
- **Problem**: Anchor.toml had wrong program ID for localnet (GmsCrZcVdArUFKrBHRpycuUUaSTr9HgwzuqnsvbXsNBV)
- **Solution**: Updated to match declare_id! in lib.rs (fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi)
- **Result**: Tests recovered from 3/33 to 33/37 passing

### Fix #2: Account reallocation for dynamic state
- **Problem**: 4 tests failing due to missing realloc when state grows
  1. Max 10 operators not enforced
  2. Authority transfer serialization failed (Vec/Option growth)
  3. Wrong person accept transfer (dependent)
  4. Full transfer cycle (dependent)
- **Root Cause**: ManageOperator, TransferAuthority, AcceptAuthority missing System program for realloc
- **Solution**:
  - Added max 10 operators check + realloc to add_operator
  - Added realloc to transfer_authority for Option<Pubkey>
  - Added System program to all three account structs
  - Added TooManyOperators error code
- **Result**: All 37 tests now passing (100%)

All security tests pass:
- ✅ Distribution security (drain attacks blocked)
- ✅ Operator privilege escalation blocked
- ✅ Max operators enforced (10 limit)
- ✅ Authority transfer 2-step process secure
- ✅ Cancel/double-distribute blocked
- ✅ Account ownership checks
- ✅ State accounting (overflow protection)
- ✅ Wrong recipient/vault/mint rejected

## Summary

✅ **Fixed** (PR review issues):
1. Private key removed from repo (devnet-test-wallet.json)
2. .gitignore hardened
3. RPC proxy has read-only whitelist
4. Path traversal protection complete
5. Bootstrap integer precision fixed
6. 30 exploration scripts archived

⚠️ **Noted** (non-critical):
1. Devnet wallet in git history (compromised, devnet only)
2. Tests regressed (investigation needed)

🔒 **Security Posture**: STRONG
- All write methods blocked on RPC proxy
- All sensitive files blocked from HTTP access
- Path traversal attacks prevented
- Credentials protected by .gitignore

**Last Updated**: 2026-02-02
