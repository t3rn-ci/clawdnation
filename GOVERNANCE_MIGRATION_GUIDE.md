# ClawdNation Governance Migration Guide

## Overview

This guide walks through migrating ClawdNation's Bootstrap and Dispenser programs from single-wallet authority to **SPL Governance** (multisig DAO).

**Architecture:**
- **Mint Authority**: ❌ BURN IT (disable minting permanently)
- **Bootstrap Authority**: ✅ SPL Governance (3 of 5 voting threshold, 24hr voting)
- **Dispenser Authority**: ✅ SPL Governance (2 of 4 voting threshold, 12hr voting)
- **Dispenser Operator**: ⚡ Hot Wallet (single signer, rate-limited, amount-capped)
- **Treasury**: ✅ SPL Governance (3 of 4 voting threshold)

---

## Prerequisites

### 1. Install Dependencies

```bash
cd solana
npm install @solana/web3.js @solana/spl-governance @solana/spl-token
```

### 2. Fund Authority Wallet

You'll need ~1 SOL for creating governance accounts:

```bash
# Check balance
solana balance

# Airdrop on devnet
solana airdrop 2
```

### 3. Verify Current State

```bash
node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');

(async () => {
  const [bootstrapState] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
  const [dispenserState] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

  const bAccount = await conn.getAccountInfo(bootstrapState);
  const dAccount = await conn.getAccountInfo(dispenserState);

  console.log('Bootstrap Authority:', new PublicKey(bAccount.data.slice(8, 40)).toBase58());
  console.log('Dispenser Authority:', new PublicKey(dAccount.data.slice(8 + 32, 8 + 64)).toBase58());
})();
"
```

---

## Migration Steps

### Phase 1: Fix Critical Issues

#### Step 1.1: Update Bootstrap Allocation Cap (100M → 200M)

```bash
cd solana
node fix-bootstrap-cap.js
```

**What it does:**
- Calls `update_cap(200_000_000_000_000_000)` on Bootstrap
- Fixes tokenomics mismatch (20% of 1B = 200M, not 100M)

**Expected output:**
```
✅ Bootstrap allocation cap updated!
Verified new cap: 200000000000000000 (200000000 CLWDN)
```

#### Step 1.2: Burn Mint Authority

**CRITICAL**: This permanently disables minting. Make sure token distribution is correct first!

```bash
spl-token authorize 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 mint --disable --url devnet
```

**Verify:**
```bash
spl-token display 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 --url devnet
```

Should show: `Mint authority: (disabled)`

---

### Phase 2: Deploy Updated Contracts (Optional)

If you want the new safety features (rate limiting, emergency pause, amount caps), rebuild and upgrade the Dispenser program:

#### Step 2.1: Build Updated Dispenser

```bash
cd dispenser
anchor build
```

#### Step 2.2: Upgrade Program

**WARNING**: Only the upgrade authority can do this. If you've transferred upgrade authority, you'll need governance approval.

```bash
anchor upgrade ./target/deploy/clwdn_dispenser.so --program-id AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ --provider.cluster devnet
```

**New Features:**
- ✅ Rate limiting: 100 distributions/hour (configurable)
- ✅ Amount cap: 10M CLWDN max per distribution (configurable)
- ✅ Emergency pause: Any operator can pause, only authority can unpause
- ✅ On-chain configuration: Authority can update limits via `update_rate_limit()` and `update_max_amount()`

---

### Phase 3: Create Governance

#### Step 3.1: Create DAO Realm and Governance Accounts

```bash
cd solana
node migrate-to-governance.js
```

**What it does:**
1. Creates a **DAO realm** named "ClawdNation DAO"
2. Creates **Bootstrap Governance** (3 of 5, 24hr voting)
3. Creates **Dispenser Governance** (2 of 4, 12hr voting)
4. Saves addresses to `governance-addresses.json`

**Expected output:**
```
╔═══════════════════════════════════════════════════════════╗
║                     MIGRATION COMPLETE                     ║
╚═══════════════════════════════════════════════════════════╝

📋 Governance Addresses:
  Realm: [address]
  Bootstrap Governance: [address]
  Dispenser Governance: [address]

💾 Addresses saved to governance-addresses.json
```

#### Step 3.2: Add Council Members

Go to [Realms.today](https://app.realms.today) and:

1. Connect wallet (current authority)
2. Find "ClawdNation DAO"
3. Go to "Members" tab
4. Add council members (up to 5 for Bootstrap, 4 for Dispenser)
5. Each member deposits CLWDN tokens to get voting power

**Or use CLI:**

```bash
# This requires spl-governance CLI (not yet stable)
# Alternatively, use Realms UI
```

---

### Phase 4: Transfer Authority

#### Step 4.1: Propose Authority Transfer

```bash
node transfer-to-governance.js
```

**What it does:**
1. Calls `transfer_authority(bootstrap_governance)` on Bootstrap
2. Calls `transfer_authority(dispenser_governance)` on Dispenser
3. Sets `pending_authority` in both programs

**State after this step:**
- Bootstrap: `authority = [your wallet]`, `pending_authority = [bootstrap governance]`
- Dispenser: `authority = [your wallet]`, `pending_authority = [dispenser governance]`

⚠️ **Programs are still controlled by your wallet** until governance accepts!

#### Step 4.2: Create Governance Proposals

Go to [Realms.today](https://app.realms.today):

1. Navigate to "ClawdNation DAO"
2. Click "New Proposal"
3. Title: "Accept Bootstrap Authority"
4. Add instruction:
   - Program: `BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN` (Bootstrap)
   - Instruction data: `accept_authority` (discriminator: sha256("global:accept_authority")[0..8])
   - Accounts:
     - `state`: Bootstrap State PDA (writable)
     - `new_authority`: Bootstrap Governance (signer)
5. Submit proposal
6. Repeat for Dispenser

**Proposal JSON template:**

```json
{
  "name": "Accept Bootstrap Authority",
  "instructions": [
    {
      "programId": "BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN",
      "accounts": [
        {
          "pubkey": "[Bootstrap State PDA]",
          "isSigner": false,
          "isWritable": true
        },
        {
          "pubkey": "[Bootstrap Governance]",
          "isSigner": true,
          "isWritable": false
        }
      ],
      "data": "[accept_authority discriminator]"
    }
  ]
}
```

#### Step 4.3: Vote and Execute

1. Council members vote on proposals (need 60% for Bootstrap, 50% for Dispenser)
2. After voting period (24hr Bootstrap, 12hr Dispenser), execute proposal
3. Governance calls `accept_authority()` on programs
4. **Authority transferred!** 🎉

---

### Phase 5: Verify Migration

#### Step 5.1: Check Authorities

```bash
node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');

(async () => {
  const [bootstrapState] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
  const [dispenserState] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

  const bAccount = await conn.getAccountInfo(bootstrapState);
  const dAccount = await conn.getAccountInfo(dispenserState);

  console.log('✅ Bootstrap Authority:', new PublicKey(bAccount.data.slice(8, 40)).toBase58());
  console.log('✅ Dispenser Authority:', new PublicKey(dAccount.data.slice(8 + 32, 8 + 64)).toBase58());
})();
"
```

**Expected:** Both should show governance addresses, not your wallet!

#### Step 5.2: Test Governance Control

Try to pause the bootstrap (should fail since you're no longer authority):

```bash
# This should fail with "Unauthorized" error
anchor run pause-bootstrap
```

Now try via governance proposal:

1. Create proposal: "Pause Bootstrap for Maintenance"
2. Add instruction: `pause()` on Bootstrap
3. Vote and execute
4. Bootstrap should pause ✅

---

## Post-Migration Operations

### Emergency Pause (Dispenser Operator)

Any operator can trigger emergency pause:

```javascript
const disc = anchorDisc('emergency_pause');
const ix = new TransactionInstruction({
  programId: DISPENSER_PROGRAM,
  keys: [
    { pubkey: dispenserState, isSigner: false, isWritable: true },
    { pubkey: operator.publicKey, isSigner: true, isWritable: false },
  ],
  data: disc,
});
```

**Only authority (governance) can unpause!**

### Update Rate Limit (Governance Only)

Create governance proposal:

```javascript
const disc = anchorDisc('update_rate_limit');
const data = Buffer.alloc(8 + 4);
disc.copy(data, 0);
data.writeUInt32LE(200, 8); // 200 distributions/hour

const ix = new TransactionInstruction({
  programId: DISPENSER_PROGRAM,
  keys: [
    { pubkey: dispenserState, isSigner: false, isWritable: true },
    { pubkey: governanceAddress, isSigner: true, isWritable: false },
  ],
  data,
});
```

### Update Max Amount (Governance Only)

```javascript
const disc = anchorDisc('update_max_amount');
const data = Buffer.alloc(8 + 8);
disc.copy(data, 0);
data.writeBigUInt64LE(20_000_000_000_000_000n, 8); // 20M CLWDN

const ix = new TransactionInstruction({
  programId: DISPENSER_PROGRAM,
  keys: [
    { pubkey: dispenserState, isSigner: false, isWritable: true },
    { pubkey: governanceAddress, isSigner: true, isWritable: false },
  ],
  data,
});
```

---

## Architecture Summary

After migration, your system looks like this:

```
┌─────────────────────────────────────────────────────────────┐
│                   ClawdNation DAO Realm                      │
│                  (app.realms.today)                          │
└─────────────────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐         ┌────▼────┐       ┌─────▼─────┐
    │Bootstrap│         │Dispenser│       │ Treasury  │
    │Govern   │         │Govern   │       │ Govern    │
    │(3 of 5) │         │(2 of 4) │       │ (3 of 4)  │
    └────┬────┘         └────┬────┘       └───────────┘
         │                   │
         │                   │
    ┌────▼────────┐    ┌─────▼────────┐
    │  Bootstrap  │    │   Dispenser  │
    │   Program   │    │    Program   │
    │             │    │              │
    │ ✅ Pause    │    │ ✅ Pause     │
    │ ✅ Update   │    │ ✅ Config    │
    │ ✅ Transfer │    │ ✅ Transfer  │
    └─────────────┘    └──────┬───────┘
                              │
                       ┌──────▼──────┐
                       │  Operator   │ ⚡ Hot Wallet
                       │ (Rate-Lim)  │   (fast, restricted)
                       └─────────────┘
```

**Security:**
- ❌ Mint Authority: BURNED (no more minting)
- ✅ Bootstrap: Multisig (24hr proposals, 3 of 5)
- ✅ Dispenser: Multisig (12hr proposals, 2 of 4)
- ⚡ Operator: Hot wallet (rate-limited, amount-capped, pauseable)

---

## FAQ

### Q: What if I lose access to my wallet during migration?

**A:** During Phase 4 (between `transfer_authority` and `accept_authority`), you can cancel the transfer:

```javascript
// Call cancel_transfer() on the program
const disc = anchorDisc('cancel_transfer');
const ix = new TransactionInstruction({
  programId: BOOTSTRAP_PROGRAM,
  keys: [
    { pubkey: bootstrapState, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
  ],
  data: disc,
});
```

Once governance accepts, there's no going back!

### Q: Can I test this on localnet first?

**A:** Yes! Change `SOLANA_RPC` to `http://localhost:8899` and deploy programs locally:

```bash
solana-test-validator &
anchor test
SOLANA_RPC=http://localhost:8899 node migrate-to-governance.js
```

### Q: What happens if an operator goes rogue?

**Options:**
1. **Emergency Pause**: Any operator can call `emergency_pause()` immediately
2. **Remove Operator**: Authority (governance) creates proposal to call `remove_operator(rogue_wallet)`
3. **Rate Limiting**: Operator can only do 100 distributions/hour max
4. **Amount Caps**: Operator can't distribute > 10M CLWDN per transaction

### Q: How do I add more council members later?

**A:** Create governance proposal to add member via Realms UI, or use spl-governance CLI.

### Q: Can community (CLWDN holders) vote?

**A:** Yes! The realm is configured with CLWDN as the community token. Holders can create proposals if they have >= 1M CLWDN.

### Q: What if a proposal is malicious?

**A:** Council members review all proposals before voting. Set `minInstructionHoldUpTime` to add delay before execution (e.g., 48 hours).

---

## Support

- **Realms Documentation**: https://docs.realms.today
- **SPL Governance**: https://github.com/solana-labs/solana-program-library/tree/master/governance
- **ClawdNation Discord**: [link]

---

## Security Checklist

Before going to mainnet:

- [ ] Audit updated dispenser contract (rate limiting, pause logic)
- [ ] Test governance proposals on devnet
- [ ] Verify all council member wallets are secure (hardware wallets recommended)
- [ ] Set appropriate voting thresholds (3 of 5 for Bootstrap, 2 of 4 for Dispenser)
- [ ] Configure `minInstructionHoldUpTime` for proposal delays
- [ ] Burn mint authority (permanently disable minting)
- [ ] Document all governance procedures for council members
- [ ] Create emergency response plan
- [ ] Test emergency pause functionality
- [ ] Verify rate limits and amount caps are set correctly
- [ ] Run full E2E test after migration

---

**Last Updated**: 2026-02-02
**Status**: Ready for Devnet Testing
