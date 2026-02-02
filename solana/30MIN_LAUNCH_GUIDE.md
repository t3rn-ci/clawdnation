# 🚀 CLAWDNATION 30-MINUTE LAUNCH GUIDE

**RECOMMENDED STRATEGY**: Bootstrap First → LP After (SECURE)

## Why This Approach?

✅ **Most Secure**: LP tokens burned (permanent lock)
✅ **No Team SOL Needed**: Bootstrap funds the LP
✅ **Simple**: Standard fair launch pattern
✅ **Fair**: Everyone gets same bootstrap rate

## 🎯 Launch Sequence

### Phase 1: Bootstrap (Day 0)

**Duration**: 24-48 hours
**Goal**: Raise SOL, distribute 100M CLWDN at fixed rate

```bash
# Start bootstrap
node launch-sequence.js --start-bootstrap

# Share on Twitter/Discord:
# "🎉 CLAWDNATION BOOTSTRAP IS LIVE!
#  💰 Fixed Rate: 10,000 CLWDN per SOL
#  🎯 Target: 100M CLWDN (10% supply)
#  📍 Contribute: [BOOTSTRAP_ADDRESS]
#  ⏱️ Duration: Until sold out"
```

**What Happens**:
- Users send SOL to bootstrap program
- Dispenser auto-distributes CLWDN at 10,000 per SOL
- SOL accumulates in treasury
- CLWDN balance decreases as distributed

**Monitor Progress**:
```bash
node launch-sequence.js --status
```

### Phase 2: Create LP + Lock (Day 1-2)

**When**: After bootstrap completes (100M CLWDN sold)

```bash
# Step 1: Check completion
node launch-sequence.js --status

# Step 2: Create LP and burn tokens
node launch-sequence.js --finalize-lp
```

**Manual Steps** (script will guide you):

1. **Create Raydium CPMM Pool**:
   - Go to https://raydium.io/create-pool/ OR
   - Use CLI: `node create-pool.js --mint [MINT] --token-amount [400M*1e9] --sol-amount [RAISED*1e9]`
   - Note the LP token address

2. **Burn LP Tokens** (CRITICAL):
   ```bash
   # Option A: Burn to null
   spl-token burn [YOUR_LP_TOKEN_ACCOUNT] [LP_TOKEN_AMOUNT] --url devnet

   # Option B: Transfer to null address
   spl-token transfer [LP_TOKEN_MINT] ALL 11111111111111111111111111111111 --url devnet
   ```

3. **Verify Burn**:
   ```bash
   spl-token balance [LP_TOKEN_MINT] --url devnet
   # Should show 0 or dust amount
   ```

### Phase 3: Announce Launch! 🎉

**Tweet**:
```
🎊 CLAWDNATION IS LIVE! 🎊

✅ Bootstrap Complete: [X] SOL raised
✅ LP Created: [X] SOL + 400M CLWDN
✅ LP Tokens BURNED (liquidity locked FOREVER 🔒)
✅ Trading LIVE on Raydium!

🔗 Trade: [RAYDIUM_POOL_URL]
📊 Chart: [DEX_SCREENER_URL]

#ClawdNation #Solana #FairLaunch
```

## 📊 Example: 10,000 SOL Raised

| Phase | CLWDN | SOL | Result |
|-------|-------|-----|--------|
| Bootstrap | 100M | 10,000 raised | Distributed at 10K per SOL |
| LP Creation | 400M | 10,000 added | Initial price = 40K per SOL |
| LP Lock | - | - | Tokens burned, locked forever |

**Math**:
- Bootstrap rate: 1 SOL = 10,000 CLWDN
- LP initial price: 1 SOL = 40,000 CLWDN (same as bootstrap)
- Total liquidity: 10,000 SOL + 400M CLWDN
- LP control: NONE (tokens burned)

## 🔒 Security Features

| Feature | Status | Description |
|---------|--------|-------------|
| Bootstrap Rate | Fixed 10K per SOL | Fair, no price manipulation |
| LP Funding | Community SOL | No team SOL needed |
| LP Control | Burned | Liquidity locked FOREVER |
| Price Start | Bootstrap Rate | No arbitrage opportunity |
| Team Access | ZERO | Cannot remove liquidity |

## ⚠️ Pre-Launch Checklist

Before running `--start-bootstrap`:

- [ ] Bootstrap program initialized on devnet
- [ ] Dispenser funded with 100M+ CLWDN
- [ ] Treasury wallet ready for SOL
- [ ] Twitter announcement drafted
- [ ] Discord/Telegram communities ready
- [ ] Raydium pool creation tested
- [ ] LP burn process understood
- [ ] Team on standby for 24-48 hours

## 🆘 Troubleshooting

### Bootstrap doesn't start
```bash
# Check bootstrap state
solana account 8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz --url devnet

# Check dispenser balance
spl-token balance 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 --owner BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w --url devnet
```

### LP creation fails
- Ensure you have sufficient SOL for gas
- Verify CLWDN balance (need 400M)
- Check Raydium program is accessible
- Try Raydium UI if CLI fails

### LP tokens not burning
```bash
# Find your LP token account
spl-token accounts [LP_TOKEN_MINT] --url devnet

# Burn from specific account
spl-token burn [ACCOUNT_ADDRESS] [AMOUNT] --url devnet
```

## 📁 Files

| File | Purpose |
|------|---------|
| `launch-sequence.js` | Main launch CLI |
| `bootstrap-to-lp-flow.js` | Strategy comparison |
| `factory-tokenomics.js` | Tokenomics model (10/40/15/15/10/10) |
| `deploy-clwdn-full.js` | Full deployment simulator |
| `launch-data.json` | Generated after launch (metrics) |

## 🎓 Learn More

- **Bootstrap Program**: `/bootstrap/programs/bootstrap/src/lib.rs`
- **Dispenser Program**: `/dispenser/programs/dispenser/src/lib.rs`
- **Tokenomics Audit**: `TOKENOMICS_AUDIT.md`
- **Deployment Guide**: `DEVNET_DEPLOYMENT_GUIDE.md`
- **Flow Analysis**: `bootstrap-to-lp-flow.js`

## 🚨 CRITICAL REMINDERS

1. **NEVER SKIP LP BURN**: Without burning, team can rug pull
2. **BOOTSTRAP BEFORE LP**: Don't create LP until bootstrap completes
3. **FIXED RATE ONLY**: Don't change rate mid-bootstrap (unfair)
4. **VERIFY BURN**: Always check LP balance after burn
5. **ANNOUNCE IMMEDIATELY**: Tell community when LP is locked

## ⏱️ Timeline Summary

| Time | Action |
|------|--------|
| T+0 | Start bootstrap (`--start-bootstrap`) |
| T+0 to T+48h | Monitor progress (`--status`) |
| T+48h | Bootstrap completes (100M sold) |
| T+48h | Create LP (`--finalize-lp`) |
| T+48h | Burn LP tokens (manual) |
| T+48h | TRADING LIVE! 🎉 |

---

**Ready to launch?**

```bash
node launch-sequence.js --start-bootstrap
```

**Need help?**

```bash
node launch-sequence.js --help
```

**Check progress?**

```bash
node launch-sequence.js --status
```

**Finalize (after bootstrap)?**

```bash
node launch-sequence.js --finalize-lp
```

---

*Generated for CLAWDNATION devnet deployment*
*Network: devnet*
*Mint: 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3*
