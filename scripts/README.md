# CLWDN Mainnet Deployment Scripts

Scripts for deploying CLWDN token infrastructure on Solana mainnet.

## Prerequisites

- Node.js 20+
- Solana CLI configured with mainnet keypairs
- Keypairs in place:
  - `/root/.config/solana/clawdnation.json` (deployer)
  - `/root/.config/solana/clwdn-wallets/team.json` (team vesting sender)
  - `/root/.config/solana/clwdn-wallets/staking.json` (staking vesting sender)
  - `/root/.config/solana/clwdn-wallets/lp.json` (LP allocation wallet)

## Install Dependencies

```bash
cd /opt/clawdnation/scripts
npm install
```

---

## Script 1: Streamflow Vesting Setup

**File:** `setup-vesting.js`

Creates two 12-month linear vesting contracts via Streamflow:

| Contract | Amount | Recipient | Duration |
|----------|--------|-----------|----------|
| Team Tokens | 150,000,000 CLWDN | `3DAZTJ...4iQQ` | 12 months, daily unlock |
| Staking Tokens | 150,000,000 CLWDN | `BSrpfn...6PC8` | 12 months, daily unlock |

**Vesting Parameters:**
- Period: 1 day (86400 seconds)
- Duration: 365 days
- Cliff: None
- canTopup: false
- cancelable: false (sender & recipient)
- transferable: false

### Usage

```bash
# Dry run — shows what would happen (default)
node setup-vesting.js
node setup-vesting.js --dry-run

# Execute — actually creates the vesting contracts
node setup-vesting.js --execute
```

### Output

Dry run prints all contract details. Execute mode prints stream IDs and transaction hashes with Solscan links.

---

## Script 2: Raydium CPMM Pool + LP Burn

**File:** `create-pool-and-burn.js`

Creates a Raydium CPMM liquidity pool and immediately burns all LP tokens.

| Parameter | Value |
|-----------|-------|
| Pool | CLWDN / SOL |
| CLWDN Amount | 10,000 CLWDN (from LP wallet) |
| SOL Amount | 1 SOL (from deployer) |
| Price | 1 CLWDN = 0.0001 SOL |
| LP Tokens | Burned immediately |

### Execution Steps

1. Transfer 10,000 CLWDN from LP wallet → deployer
2. Create CPMM pool via Raydium SDK
3. Burn ALL LP tokens received
4. Verify LP balance = 0

### Usage

```bash
# Dry run — shows plan and checks balances (default)
node create-pool-and-burn.js
node create-pool-and-burn.js --dry-run

# Execute — creates pool and burns LP tokens
node create-pool-and-burn.js --execute
```

### Output

Dry run shows configuration, balance checks, and estimated details. Execute mode prints transaction hashes for each step with Solscan links.

---

## CLWDN Token Details

| Property | Value |
|----------|-------|
| Mint | `3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG` |
| Decimals | 9 |
| Network | Solana Mainnet |

## Important Notes

⚠️ **Always run dry-run first** to verify everything looks correct.

⚠️ **LP burn is irreversible** — once LP tokens are burned, the liquidity is permanently locked in the pool.

⚠️ **Vesting contracts are non-cancellable** — double-check recipient addresses before executing.

⚠️ **RPC rate limits** — mainnet RPC may rate-limit. Consider using a dedicated RPC endpoint for production.
