# Archived Scripts

These scripts have been moved to `archive/` because they are exploration artifacts, testing tools, or insecure off-chain implementations that should not be used for production/mainnet.

## Script Categories

### Bonding Curve / Launch Exploration
- `init-and-test-bonding-curve.js` - Testing script
- `init-bonding-simple.js` - Simple bonding curve init
- `init-auto-split-bootstrap.js` - Auto-split variant
- `launch-bonding-curve.js` - Launch with bonding curve
- `launch-phase-factory.js` - Phase-based launch
- `launch-sequence.js` - Original launch sequence
- `launch-sequence-v2.js` - Launch sequence v2
- `launch.js` - Simple launch script

### LP / Raydium Integration (INSECURE - OFF-CHAIN)
**⚠️ WARNING**: These scripts perform LP creation/burn OFF-CHAIN and are NOT SAFE for mainnet.
See `CRITICAL_SECURITY_GAP.md` for details on on-chain LP burn implementation.

- `create-emergency-lp.js` - Emergency LP creation (off-chain)
- `create-lp-and-burn.js` - LP creation + burn (off-chain)
- `raydium-lp-integration.js` - Raydium integration (off-chain)
- `create-pool.js` - Pool creation (off-chain)
- `progressive-lp-launch.js` - Progressive LP (off-chain)
- `bootstrap-progressive-lp.js` - Bootstrap progressive LP
- `bootstrap-to-lp-flow.js` - Bootstrap to LP flow

### Factory / Token Economics Exploration
- `factory-no-bootstrap.js` - Factory without bootstrap
- `factory-tokenomics.js` - Tokenomics factory
- `configurable-factory.js` - Configurable factory
- `token-factory.js` - Token factory
- `clwdn-vesting-factory.js` - Vesting factory

### Governance / Multisig Exploration
- `migrate-to-governance.js` - Governance migration
- `transfer-to-governance.js` - Transfer to governance
- `setup-multisig-treasury.js` - Multisig setup

### Setup / One-time Scripts
- `setup-vault.js` - Vault setup
- `setup-vesting.js` - Vesting setup
- `fix-bootstrap-cap.js` - One-time bootstrap cap fix

### Testing / Visualization
- `visualize-curve.js` - Curve visualization tool
- `e2e-local.js` - Local E2E testing
- `test-local.js` - Local testing
- `add-metadata.js` - Metadata addition tool

## Production Scripts (Still in solana/)

The following scripts remain in `solana/` for production use:

**Core Services:**
- `bootstrap-monitor.js` - Bootstrap monitoring (used by serve.js)
- `dispenser-service.js` - Dispenser service (production)
- `dispenser-service-local.js` - Dispenser service (local dev)
- `payment-monitor.js` - Payment monitoring

**Deployment:**
- `deploy-clwdn-full.js` - Full CLWDN deployment
- `init-programs.js` - Program initialization

**E2E Testing:**
- `e2e-test-bootstrap.js` - E2E tests with bootstrap path
- `e2e-test-no-bootstrap.js` - E2E tests without bootstrap
- `e2e-test.js` - General E2E tests

**Operator Management:**
- `add-dispenser-operator.js` - Add dispenser operator
- `fix-dispenser-operator.js` - Fix operator issues
- `add-operator-raw.js` - Raw operator addition

**State Management:**
- `check-dispenser-state.js` - Check dispenser state

## Why Archive?

These scripts were moved to reduce clutter and make it clearer which scripts are production-ready vs exploration artifacts. They are preserved for reference and can be restored if needed.

**Date Archived:** 2026-02-02
**PR:** #1 Review cleanup
