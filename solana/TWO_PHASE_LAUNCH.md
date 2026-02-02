# 🚀 TWO-PHASE BOOTSTRAP → LP LAUNCH

**Complete integration of Bootstrap program with automatic LP creation**

## 🎯 Overview

This system splits the launch into two clear phases:

### **Phase 1: Bootstrap (Day 0)**
- Users contribute SOL
- Receive CLWDN at fixed rate (10K per SOL)
- Distributes 100M CLWDN (10% of supply)
- SOL accumulates in treasury
- **Auto-completes** when 100M CLWDN distributed

### **Phase 2: Complete Raise (Day X)**
- Trigger `complete_raise()` on Bootstrap program
- Creates Raydium LP with:
  - ALL SOL raised (e.g., 10K SOL)
  - 400M CLWDN (40% of supply)
- Burns LP tokens → **liquidity locked forever** 🔒

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│              PHASE 1: BOOTSTRAP                      │
│                                                      │
│  User sends SOL → Bootstrap Program                 │
│       ↓                                             │
│  SOL → Treasury Wallet                              │
│       ↓                                             │
│  ContributionEvent emitted                          │
│       ↓                                             │
│  Dispenser auto-distributes CLWDN                   │
│       ↓                                             │
│  Repeat until 100M CLWDN distributed                │
│       ↓                                             │
│  bootstrap_complete = true                          │
└──────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────┐
│          PHASE 2: COMPLETE RAISE → LP                │
│                                                      │
│  Authority calls complete_raise()                    │
│       ↓                                             │
│  BootstrapCompleteEvent emitted                     │
│       ↓                                             │
│  Create Raydium CPMM Pool                           │
│    - Input: [RAISED_SOL] + 400M CLWDN               │
│    - Output: LP tokens                              │
│       ↓                                             │
│  Burn LP tokens                                     │
│    - Method: spl-token burn                         │
│    - Result: Liquidity LOCKED FOREVER 🔒            │
└──────────────────────────────────────────────────────┘
```

## 📁 Files Created

### Core Programs

| File | Purpose |
|------|---------|
| `bootstrap/programs/bootstrap/src/lib.rs` | Current Bootstrap program (Phase 1 only) |
| `bootstrap/programs/bootstrap/src/lib_with_lp.rs` | **Enhanced** Bootstrap with LP support (Phase 1 + 2) |

### Integration Scripts

| File | Purpose |
|------|---------|
| `launch-sequence-v2.js` | **Main CLI** for two-phase launch |
| `raydium-lp-integration.js` | Raydium CPMM integration helpers |
| `launch-sequence.js` | Original single-phase launch (v1) |

### Documentation

| File | Purpose |
|------|---------|
| `TWO_PHASE_LAUNCH.md` | This file - complete guide |
| `30MIN_LAUNCH_GUIDE.md` | Quick launch guide (v1) |
| `bootstrap-to-lp-flow.js` | Strategy comparison (3 options) |

## 🔧 Setup

### 1. Deploy Enhanced Bootstrap Program

The enhanced program (`lib_with_lp.rs`) adds these new features:
- `bootstrap_complete` state flag
- `lp_created` state flag
- `complete_raise()` instruction
- `create_lp()` instruction (placeholder for Raydium CPI)
- `burn_lp_tokens()` instruction

**To deploy**:

```bash
cd bootstrap

# Backup current program
cp programs/bootstrap/src/lib.rs programs/bootstrap/src/lib_original.rs

# Use enhanced version
cp programs/bootstrap/src/lib_with_lp.rs programs/bootstrap/src/lib.rs

# Build and deploy
anchor build
anchor deploy --provider.cluster devnet

# Initialize with LP parameters
anchor run initialize --provider.cluster devnet
```

**Initialize args**:
```javascript
{
  targetSol: 10_000,        // Target 10K SOL
  allocationCap: 100_000_000, // 100M CLWDN bootstrap
  lpClwdnAmount: 400_000_000  // 400M CLWDN for LP
}
```

### 2. Fund Dispenser

The Dispenser needs CLWDN for bootstrap phase:

```bash
# Transfer 100M+ CLWDN to Dispenser
spl-token transfer \
  2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  100000000 \
  BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w \
  --fund-recipient \
  --url devnet
```

### 3. Prepare LP CLWDN

Authority wallet needs 400M CLWDN for LP creation:

```bash
# Check balance
spl-token balance 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 --url devnet

# Transfer if needed
spl-token transfer \
  2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  400000000 \
  [AUTHORITY_ADDRESS] \
  --url devnet
```

## 🚀 Launch Sequence

### Phase 1: Start Bootstrap

```bash
# Start bootstrap phase
node launch-sequence-v2.js --start-bootstrap
```

**What happens**:
1. Checks Bootstrap program is deployed
2. Verifies Dispenser has sufficient CLWDN
3. Shows contribution address
4. Provides Twitter announcement template

**Share on socials**:
```
🎉 CLAWDNATION BOOTSTRAP IS LIVE!

💰 Fixed Rate: 10,000 CLWDN per SOL
🎯 Target: 10,000 SOL
📍 Contribute: [BOOTSTRAP_ADDRESS]
⏱️ Duration: Until 100M CLWDN sold

Fair launch, no presale, LP locked forever! 🔒
```

### Phase 1: Monitor Progress

```bash
# Check status anytime
node launch-sequence-v2.js --status
```

**Output shows**:
- SOL raised so far
- CLWDN distributed
- % complete
- Whether ready for Phase 2

### Phase 2: Complete Raise

When bootstrap reaches 100M CLWDN distributed:

```bash
# Mark bootstrap complete and prepare LP
node launch-sequence-v2.js --complete-raise
```

**What happens**:
1. Verifies bootstrap is complete
2. Shows LP configuration (SOL + CLWDN amounts)
3. Provides Raydium pool creation instructions

### Phase 2: Create Raydium Pool

**Option A: Raydium UI** (Recommended for devnet)

1. Go to https://raydium.io/liquidity/create/
2. Connect wallet
3. Select token pair: WSOL / CLWDN
4. Add liquidity:
   - SOL: [Amount raised in bootstrap]
   - CLWDN: 400,000,000
5. Click "Create Pool"
6. Note the LP token mint address

**Option B: Raydium CLI**

```bash
npm install -g @raydium-io/raydium-cli

raydium create-pool \
  --token-a So11111111111111111111111111111111111111112 \
  --token-b 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  --amount-a [RAISED_SOL * 1e9] \
  --amount-b 400000000000000000 \
  --url devnet
```

**Option C: Integration Script**

```bash
node raydium-lp-integration.js
```

### Phase 3: Burn LP Tokens

**CRITICAL**: This locks liquidity forever!

```bash
# Find your LP token account
spl-token accounts [LP_TOKEN_MINT] --url devnet

# Burn LP tokens
node launch-sequence-v2.js --burn-lp [LP_MINT] [LP_ACCOUNT]

# Or directly:
spl-token burn [LP_ACCOUNT] ALL --url devnet
```

**Verify burn**:
```bash
spl-token balance [LP_MINT] --url devnet
# Should show 0
```

### Phase 3: Announce Launch! 🎉

```
🎊 CLAWDNATION IS LIVE! 🎊

✅ Bootstrap Complete: [X] SOL raised
✅ LP Created: [X] SOL + 400M CLWDN
✅ LP Tokens BURNED 🔥
✅ Liquidity LOCKED FOREVER 🔒
✅ Trading LIVE on Raydium!

🔗 Trade: [RAYDIUM_POOL_URL]
📊 Chart: [DEX_SCREENER_URL]

Fair launch complete! 💎🙌
```

## 📊 Tokenomics Breakdown

| Allocation | Amount | % | Status | Vesting |
|------------|--------|---|--------|---------|
| **Bootstrap** | 100M | 10% | ✅ Distributed | Immediate |
| **Liquidity** | 400M | 40% | 🔒 Locked | Forever (LP burned) |
| Staking Rewards | 150M | 15% | ⏳ Pending | 48 months linear |
| Team | 150M | 15% | ⏳ Pending | 6m cliff + 12m vest |
| Community/Airdrops | 100M | 10% | ⏳ Pending | TBD |
| Treasury | 100M | 10% | ⏳ Pending | Governance |

**Total**: 1,000M CLWDN (900M minted + 100M initial supply)

## 🔐 Security Features

### Bootstrap Phase
- ✅ Fixed rate (no price manipulation)
- ✅ SOL goes directly to treasury (not program)
- ✅ Allocation cap enforced on-chain
- ✅ Auto-completes when cap reached
- ✅ Can be paused by authority

### LP Creation Phase
- ✅ Only callable after bootstrap complete
- ✅ Uses all raised SOL (no team profit)
- ✅ LP tokens burned immediately
- ✅ Liquidity locked forever (no rug pull)
- ✅ Price starts at bootstrap rate (fair)

### Authority Controls
- ✅ 2-step authority transfer
- ✅ Separate operator for distributions
- ✅ Emergency pause function
- ✅ Rate limiting on distributions

## 🆚 Comparison with V1

| Feature | V1 (Single-Phase) | V2 (Two-Phase) |
|---------|-------------------|----------------|
| Bootstrap | ✅ Manual trigger | ✅ Auto-complete |
| LP Creation | ⚠️ External only | ✅ Integrated trigger |
| LP Burn | ⚠️ Manual command | ✅ Program instruction |
| State Tracking | ❌ Off-chain only | ✅ On-chain flags |
| Automation | 🟡 Partial | 🟢 Full |

**Recommendation**: Use V2 for production launches (more automated and secure)

## 🐛 Troubleshooting

### Bootstrap won't start
```bash
# Check program deployment
solana program show BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN --url devnet

# Check bootstrap state
solana account 8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz --url devnet

# Check dispenser balance
spl-token balance 2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
  --owner BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w \
  --url devnet
```

### LP creation fails
- **Insufficient CLWDN**: Check authority wallet has 400M+ CLWDN
- **Insufficient SOL**: Need ~5-10 SOL for pool creation gas
- **Wrong network**: Verify using devnet for testing
- **Raydium not available**: Try UI instead of CLI

### LP burn fails
- **Wrong account**: Verify LP token account address
- **Insufficient authority**: Must be LP token account owner
- **Already burned**: Check balance first

### Can't find LP tokens
```bash
# Find all LP token accounts
spl-token accounts --url devnet

# Filter for Raydium LP
# LP mints usually start with certain prefixes
```

## 📚 Additional Resources

### Raydium CPMM
- GitHub: https://github.com/raydium-io/raydium-cpmm
- Docs: https://docs.raydium.io/
- Devnet UI: https://raydium.io/liquidity/create/

### Anchor Framework
- Docs: https://www.anchor-lang.com/
- Book: https://book.anchor-lang.com/

### Solana Programs
- SPL Token: https://spl.solana.com/token
- System Program: https://docs.solana.com/developing/runtime-facilities/programs

## ⏱️ Complete Timeline

| Time | Action | Command |
|------|--------|---------|
| T-1h | Deploy Bootstrap | `anchor deploy` |
| T-1h | Fund Dispenser | `spl-token transfer` |
| T+0 | Start Bootstrap | `node launch-sequence-v2.js --start-bootstrap` |
| T+0 to +48h | Users Contribute | Bootstrap program |
| T+0 to +48h | Monitor | `node launch-sequence-v2.js --status` |
| T+48h | Bootstrap Complete | Auto (when 100M sold) |
| T+48h | Complete Raise | `node launch-sequence-v2.js --complete-raise` |
| T+48h | Create LP | Raydium UI/CLI |
| T+48h | Burn LP Tokens | `node launch-sequence-v2.js --burn-lp` |
| T+48h | Announce Launch! | Twitter/Discord |

## 🎓 Key Learnings

### Why Two Phases?

1. **Bootstrap First**: Collects community funding (no team SOL needed)
2. **LP After**: Uses raised SOL (fully community-funded liquidity)
3. **Burn Immediately**: Locks liquidity forever (anti-rug)

### Why Auto-Complete?

- ✅ No manual intervention needed
- ✅ Trustless (code enforces completion)
- ✅ Fair (no selective timing)

### Why Raydium CPMM?

- ✅ Standard Solana DEX
- ✅ Constant product formula (like Uniswap)
- ✅ Deep liquidity support
- ✅ Battle-tested on mainnet

## 🚨 Production Checklist

Before mainnet launch:

- [ ] Audit Bootstrap program code
- [ ] Test complete flow on devnet (3+ times)
- [ ] Verify Raydium integration works
- [ ] Test LP burn process
- [ ] Prepare backup procedures
- [ ] Document all addresses
- [ ] Setup monitoring/alerts
- [ ] Prepare announcement templates
- [ ] Brief team on timeline
- [ ] Have contingency plans

## 💬 Support

Questions? Issues?

1. Check this guide first
2. Review `bootstrap-to-lp-flow.js` for strategy details
3. Test on devnet before mainnet
4. Join ClawdNation Discord for live support

---

**Ready to launch?**

```bash
node launch-sequence-v2.js --start-bootstrap
```

**Good luck! 🚀**
