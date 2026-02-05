# CRITICAL BUG: Bootstrap Rate Calculation

## Problem Found

The bootstrap smart contract has a critical bug in the rate calculation (lib.rs lines 127-133).

### Current (BROKEN) Code:
```rust
let clwdn_lamports = (amount_lamports as u128)
    .checked_mul(current_rate as u128)  // 20M × 10,000 = 200M
    .ok_or(BootstrapError::Overflow)?;

let clwdn_amount = clwdn_lamports
    .checked_div(1_000_000_000)  // 200M / 1B = 0.2 → rounds to 0!
    .ok_or(BootstrapError::Overflow)? as u64;
```

### Issue:
- User contributes 0.02 SOL (20,000,000 lamports)
- Rate is 10,000 CLWDN/SOL
- Expected: 200 CLWDN (200,000,000,000 lamports)
- **Actual: 0 CLWDN allocated!** (gets rounded down)

### Why It Happens:
The `start_rate` is stored as `10_000` (raw number, not in lamports).
The calculation multiplies lamports × rate, then divides by 1 billion.
This gives the wrong result because the rate isn't scaled properly.

### Correct Fix:

**Option 1** - Simple multiplication (RECOMMENDED):
```rust
// Since start_rate is CLWDN/SOL and amount is in lamports,
// multiplying directly gives CLWDN in lamports
let clwdn_amount = (amount_lamports as u128)
    .checked_mul(current_rate as u128)
    .ok_or(BootstrapError::Overflow)? as u64;
```

**Option 2** - Store rate in lamports:
```rust
// During initialize, store rate as:
state.start_rate = params.start_rate * 1_000_000_000;  // 10,000 → 10 trillion

// Then calculation stays the same:
let clwdn_lamports = amount_lamports * current_rate;
let clwdn_amount = clwdn_lamports / 1_000_000_000;
```

## Impact

- **Current state**: Users get 0 CLWDN for contributions < 0.1 SOL
- **For 0.02 SOL**: Getting 0 CLWDN instead of 200 CLWDN
- **Missing tokens**: 200 CLWDN owed to contributor

## Fix Steps

1. **DO NOT ACCEPT MORE CONTRIBUTIONS** until fixed
2. Refund existing contributor: 0.02 SOL to `GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE`
3. Fix the calculation in `bootstrap/programs/bootstrap/src/lib.rs` lines 127-133
4. Rebuild and redeploy the program
5. Close old bootstrap state and reinitialize with correct code

## Verification

After fix, test with 0.01 SOL:
- Expected: 100 CLWDN (100,000,000,000 lamports)
- Verify contributor record shows correct allocation

## Files to Update

1. `/Users/mbultra/projects/clawdnation/bootstrap/programs/bootstrap/src/lib.rs` (lines 127-133)
2. Test before redeploying to mainnet!
