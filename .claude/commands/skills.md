# /skills - ClawdNation X Bot Launch Skills

Configure and execute token launches via X bot using ClawdNation's unified launch system.

## Bootstrap (Self-Birth) Configuration

### Standard Bootstrap Parameters

```json
{
  "launchMode": "bootstrap",
  "network": "mainnet",
  "bootstrap": {
    "enabled": true,
    "startRate": 10000,
    "endRate": 40000,
    "allocationCap": 100000000,
    "minContribution": 0.1,
    "maxPerWallet": 10,
    "targetRaise": 4000,
    "lpSplit": 80,
    "masterSplit": 10,
    "stakingSplit": 10
  }
}
```

### Bootstrap Parameters Explained

**Rate Configuration:**
- `startRate: 10000` - Initial price: 10,000 tokens per SOL
- `endRate: 40000` - Final price: 40,000 tokens per SOL
- **300% price increase** during bonding curve

**Contribution Limits:**
- `allocationCap: 100000000` - Max 100M tokens for bootstrap phase
- `minContribution: 0.1` - Minimum 0.1 SOL per contribution
- `maxPerWallet: 10` - Maximum 10 SOL per wallet
- `targetRaise: 4000` - Target raise of 4,000 SOL

**Fund Distribution (80/10/10):**
- `lpSplit: 80` - 80% of raised SOL → Raydium LP
- `masterSplit: 10` - 10% of raised SOL → Project master wallet
- `stakingSplit: 10` - 10% of raised SOL → Staking rewards

### Tokenomics Configuration

**Standard Bootstrap Allocation (50/15/15/10/10):**

```json
{
  "tokenomics": {
    "liquidity": 50,
    "team": 15,
    "staking": 15,
    "community": 10,
    "treasury": 10
  },
  "distribution": {
    "liquidity": 500000000,
    "team": 150000000,
    "staking": 150000000,
    "community": 100000000,
    "treasury": 100000000
  }
}
```

### Vesting Schedules

**Team Vesting (6mo cliff + 12mo linear):**
```json
{
  "team": {
    "enabled": true,
    "cliff": 15552000,
    "duration": 31104000,
    "description": "6 month cliff + 12 month linear"
  }
}
```

**Staking Vesting (4yr linear):**
```json
{
  "staking": {
    "enabled": true,
    "cliff": 0,
    "duration": 126144000,
    "description": "4 year linear vest"
  }
}
```

**Community/Treasury (Immediate):**
```json
{
  "community": {
    "enabled": false,
    "cliff": 0,
    "duration": 0,
    "description": "Immediate for airdrops"
  },
  "treasury": {
    "enabled": false,
    "cliff": 0,
    "duration": 0,
    "description": "DAO controlled"
  }
}
```

## X Bot Commands

### Launch Bootstrap Token

```
@ClawdNation launch --bootstrap --config bootstrap.json
```

**Bot Response:**
```
🚀 Launching bootstrap token...

📊 Configuration:
Token: {name} ({symbol})
Supply: 1,000,000,000
Bonding Curve: 10,000 → 40,000 tokens/SOL (300% increase)
Target Raise: 4,000 SOL

💧 LP Split (80/10/10):
80% → Raydium LP
10% → Master wallet
10% → Staking rewards

🔒 Vesting:
Team: 6mo cliff + 12mo linear
Staking: 4yr linear

⚡ Status: Accepting contributions...
```

### Check Bootstrap Status

```
@ClawdNation status --bootstrap
```

**Bot Response:**
```
📈 Bootstrap Status:

💰 Raised: 2,456.78 SOL / 4,000 SOL (61.4%)
👥 Contributors: 1,234 wallets
📊 Tokens Allocated: 61,419,500 / 100,000,000 (61.4%)
💵 Current Rate: ~25,000 tokens/SOL

⏱️ Time Remaining: 2d 14h 36m
🎯 Next Milestone: 3,000 SOL (75%)
```

### Finalize Bootstrap

```
@ClawdNation finalize --bootstrap
```

**Bot Response:**
```
✅ Bootstrap finalized!

📊 Final Stats:
Total Raised: 4,123.45 SOL
Contributors: 1,456 wallets
Tokens Distributed: 100,000,000

💧 LP Creation:
SOL: 3,298.76 (80%)
Tokens: 500,000,000
LP Tokens: BURNED 🔥

💰 Fund Distribution:
Master: 412.35 SOL (10%)
Staking: 412.35 SOL (10%)

🔒 Security:
Mint Authority: null ✅
Freeze Authority: null ✅
LP Burned: true ✅

🔗 Links:
Token: https://solscan.io/{mint}
LP: https://raydium.io/pools/{pool}
```

## Configuration Templates

### Template A: Balanced Bootstrap (50/15/15/10/10)
```bash
node launch.js --config configs/bootstrap.json --mainnet
```

### Template B: Community-First Bootstrap (40/10/20/20/10)
```json
{
  "tokenomics": {
    "liquidity": 40,
    "team": 10,
    "staking": 20,
    "community": 20,
    "treasury": 10
  },
  "bootstrap": {
    "startRate": 10000,
    "endRate": 40000,
    "lpSplit": 80,
    "masterSplit": 10,
    "stakingSplit": 10
  }
}
```

### Template C: Liquidity-Heavy Bootstrap (60/10/10/10/10)
```json
{
  "tokenomics": {
    "liquidity": 60,
    "team": 10,
    "staking": 10,
    "community": 10,
    "treasury": 10
  },
  "bootstrap": {
    "startRate": 8000,
    "endRate": 32000,
    "lpSplit": 85,
    "masterSplit": 10,
    "stakingSplit": 5
  }
}
```

## Security Checklist

Before mainnet launch:

- [ ] Tokenomics sum to 100%
- [ ] Bootstrap startRate < endRate
- [ ] LP split ≥ 70% (recommended 80%)
- [ ] Team vesting ≥ 6mo cliff
- [ ] Staking vesting ≥ 2yr duration
- [ ] Dry-run validation passed
- [ ] Security settings configured:
  - [ ] `mintAuthority: null`
  - [ ] `freezeAuthority: null`
  - [ ] `burnLP: true`
  - [ ] `vestingDeployed: true`

## X Bot Integration

### POST /api/launch
```json
{
  "mode": "bootstrap",
  "network": "mainnet",
  "config": {
    "token": {
      "name": "ClawdToken",
      "symbol": "CLAWD",
      "supply": 1000000000,
      "decimals": 9
    },
    "bootstrap": {
      "startRate": 10000,
      "endRate": 40000,
      "targetRaise": 4000,
      "lpSplit": 80
    }
  }
}
```

### Response
```json
{
  "status": "launched",
  "mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "bootstrap": {
    "address": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    "status": "active",
    "raised": 0,
    "target": 4000
  },
  "links": {
    "contribute": "https://clawdnation.com/bootstrap/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    "explorer": "https://solscan.io/token/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  }
}
```

## Examples

### Quick Bootstrap Launch
```bash
# 1. Create config
cat > my-bootstrap.json <<EOF
{
  "launchMode": "bootstrap",
  "network": "mainnet",
  "token": {
    "name": "MyToken",
    "symbol": "MTK",
    "supply": 1000000000,
    "decimals": 9
  },
  "tokenomics": {
    "liquidity": 50,
    "team": 15,
    "staking": 15,
    "community": 10,
    "treasury": 10
  },
  "bootstrap": {
    "enabled": true,
    "startRate": 10000,
    "endRate": 40000,
    "targetRaise": 4000,
    "lpSplit": 80,
    "masterSplit": 10,
    "stakingSplit": 10
  }
}
EOF

# 2. Validate
node launch.js --config my-bootstrap.json --dry-run

# 3. Launch
node launch.js --config my-bootstrap.json --self-birth --mainnet
```

### Via X Bot
```
@ClawdNation launch --bootstrap \
  --name "MyToken" \
  --symbol "MTK" \
  --raise 4000 \
  --rate 10000-40000 \
  --split 80/10/10
```

## Advanced Configuration

### Custom Bonding Curve
```json
{
  "bootstrap": {
    "startRate": 5000,
    "endRate": 50000,
    "allocationCap": 200000000,
    "targetRaise": 10000
  }
}
```
**Result:** 1000% price increase, 200M token allocation, 10k SOL target

### Aggressive Liquidity
```json
{
  "tokenomics": {
    "liquidity": 70,
    "team": 10,
    "staking": 10,
    "community": 5,
    "treasury": 5
  },
  "bootstrap": {
    "lpSplit": 90,
    "masterSplit": 5,
    "stakingSplit": 5
  }
}
```
**Result:** 70% supply in LP, 90% of raised funds to LP

### Extended Vesting
```json
{
  "vesting": {
    "team": {
      "enabled": true,
      "cliff": 31104000,
      "duration": 62208000,
      "description": "12 month cliff + 24 month linear"
    },
    "staking": {
      "enabled": true,
      "cliff": 0,
      "duration": 157680000,
      "description": "5 year linear vest"
    }
  }
}
```
**Result:** 3yr total team vest, 5yr staking vest

## Verification

After launch:
```bash
# Verify LP burn
node solana/verify-lp-burn.js <LP_MINT> --mainnet

# Check token
solana-test-validator account <TOKEN_MINT> --url mainnet

# View on explorer
https://solscan.io/token/<TOKEN_MINT>
```

## Support

- Documentation: `launch-config-standards.md`
- Template: `launch-config-template.json`
- Examples: `configs/` directory
- E2E Testing: `E2E_TEST_SCENARIO.md`

---

**Ready to launch?** Use `/launch` command or configure via X bot!
