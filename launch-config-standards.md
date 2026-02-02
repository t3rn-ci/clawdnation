# 🚀 Token Launch Configuration Standards

## Overview

This document defines the standard configuration format for ClawdNation token launches, supporting both **Bootstrap Mode** (bonding curve) and **No-Bootstrap Mode** (direct LP).

---

## 📋 Configuration Modes

### Mode 1: Bootstrap (Self-Birth System)
Community-driven bonding curve launch with progressive pricing.

**Use Case**:
- Community wants to participate in price discovery
- Fair launch with transparent pricing
- SOL contributions fund the LP
- Automatic 80/10/10 split

### Mode 2: No-Bootstrap (Direct LP)
Direct liquidity pool creation with fixed tokenomics.

**Use Case**:
- Quick launch without bonding curve
- Team/Treasury funded liquidity
- Fixed initial price
- Standard DeFi token launch

---

## 🎯 Standard Tokenomics Templates

### Template A: Balanced (Default)
```json
{
  "liquidity": 50,
  "team": 15,
  "staking": 15,
  "community": 10,
  "treasury": 10
}
```
**Best For**: Standard DeFi projects with balanced distribution

### Template B: Community-First
```json
{
  "liquidity": 40,
  "team": 10,
  "staking": 20,
  "community": 20,
  "treasury": 10
}
```
**Best For**: Community-driven projects, DAOs

### Template C: Growth-Focused
```json
{
  "liquidity": 45,
  "team": 20,
  "staking": 10,
  "community": 15,
  "treasury": 10
}
```
**Best For**: Startups needing team incentives

### Template D: Liquidity-Heavy
```json
{
  "liquidity": 60,
  "team": 10,
  "staking": 10,
  "community": 10,
  "treasury": 10
}
```
**Best For**: High liquidity depth needed

---

## 🔒 Vesting Schedule Standards

### Team Vesting (Recommended)
```json
{
  "cliff": 15552000,
  "duration": 31104000,
  "description": "6 month cliff + 12 month linear"
}
```
**Why**: Aligns team incentives, prevents dumps

### Staking Vesting (Recommended)
```json
{
  "cliff": 0,
  "duration": 126144000,
  "description": "4 year linear vest"
}
```
**Why**: Long-term holder incentives, sustainable emissions

### Community (Immediate)
```json
{
  "cliff": 0,
  "duration": 0,
  "description": "Immediate distribution"
}
```
**Why**: Airdrops, marketing, community engagement

### Treasury (Multisig)
```json
{
  "cliff": 0,
  "duration": 0,
  "description": "Multisig controlled"
}
```
**Why**: Governance controlled, flexible use

---

## 🌊 Bootstrap Parameters

### Conservative (Lower Risk)
```json
{
  "startRate": 10000,
  "endRate": 30000,
  "targetRaise": 2000,
  "maxPerWallet": 5
}
```
**Result**: 3x price increase, $2M raise, lower whale risk

### Standard (Balanced)
```json
{
  "startRate": 10000,
  "endRate": 40000,
  "targetRaise": 4000,
  "maxPerWallet": 10
}
```
**Result**: 4x price increase, $4M raise, balanced participation

### Aggressive (High Growth)
```json
{
  "startRate": 5000,
  "endRate": 50000,
  "targetRaise": 8000,
  "maxPerWallet": 20
}
```
**Result**: 10x price increase, $8M raise, higher growth potential

---

## 💧 Liquidity Pool Standards

### Minimum Viable LP
```json
{
  "initialSOL": 5,
  "feeRate": 30,
  "burnLP": true
}
```
**Best For**: Small projects, testing

### Standard LP
```json
{
  "initialSOL": 10,
  "feeRate": 30,
  "burnLP": true
}
```
**Best For**: Most projects

### Deep Liquidity LP
```json
{
  "initialSOL": 50,
  "feeRate": 25,
  "burnLP": true
}
```
**Best For**: High-volume projects

---

## 🔐 Security Checklist

### Required for Mainnet ✅
- [ ] `mintAuthority: null` - No more tokens can be minted
- [ ] `freezeAuthority: null` - Accounts cannot be frozen
- [ ] `supplyFixed: true` - Total supply is fixed
- [ ] `lpBurned: true` - LP tokens burned (pool locked)
- [ ] `vestingDeployed: true` - Vesting contracts deployed

### Recommended ⭐
- [ ] `treasuryMultisig: true` - Treasury requires 2+ signatures
- [ ] Team vesting enabled
- [ ] Staking vesting enabled
- [ ] Audit completed

### Optional 🔄
- [ ] KYC for team
- [ ] Insurance fund
- [ ] Emergency pause mechanism

---

## 📊 Configuration Examples

### Example 1: Bootstrap Launch (Self-Birth)
```json
{
  "launchMode": "bootstrap",
  "network": "mainnet",
  "token": {
    "name": "ClawdNation",
    "symbol": "CLWDN",
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
  },
  "vesting": {
    "team": {
      "enabled": true,
      "cliff": 15552000,
      "duration": 31104000
    },
    "staking": {
      "enabled": true,
      "cliff": 0,
      "duration": 126144000
    }
  },
  "security": {
    "mintAuthority": null,
    "freezeAuthority": null,
    "lpBurned": true
  }
}
```

### Example 2: No-Bootstrap Launch (Quick Start)
```json
{
  "launchMode": "no-bootstrap",
  "network": "mainnet",
  "token": {
    "name": "QuickToken",
    "symbol": "QUICK",
    "supply": 1000000000,
    "decimals": 9
  },
  "tokenomics": {
    "liquidity": 60,
    "team": 10,
    "staking": 10,
    "community": 10,
    "treasury": 10
  },
  "liquidity": {
    "initialSOL": 20,
    "initialPrice": 50000,
    "feeRate": 30,
    "burnLP": true
  },
  "vesting": {
    "team": {
      "enabled": true,
      "cliff": 7776000,
      "duration": 15552000
    }
  },
  "security": {
    "mintAuthority": null,
    "freezeAuthority": null,
    "lpBurned": true
  }
}
```

---

## 🎨 Customization Guide

### Adjusting Tokenomics
```bash
# Change allocation percentages (must total 100)
"tokenomics": {
  "liquidity": 45,    # -5%
  "team": 15,         # 0%
  "staking": 20,      # +5%
  "community": 10,    # 0%
  "treasury": 10      # 0%
}
```

### Adjusting Vesting
```bash
# Team: 1 year cliff + 2 year vest
"team": {
  "cliff": 31536000,      # 1 year in seconds
  "duration": 63072000    # 2 years in seconds
}
```

### Adjusting Bootstrap
```bash
# More aggressive pricing
"bootstrap": {
  "startRate": 5000,      # Lower start = cheaper entry
  "endRate": 80000,       # Higher end = more growth
  "targetRaise": 10000    # Higher target
}
```

---

## ⚙️ Time Conversion Reference

| Period | Seconds | Use Case |
|--------|---------|----------|
| 1 month | 2592000 | Short cliff |
| 3 months | 7776000 | Quick vest start |
| 6 months | 15552000 | Standard cliff |
| 1 year | 31536000 | Long cliff |
| 2 years | 63072000 | Medium vest |
| 4 years | 126144000 | Long vest |

---

## ✅ Validation Rules

### Tokenomics
- All percentages must sum to 100
- Each category must be > 0
- Liquidity should be ≥ 30% for healthy trading

### Bootstrap
- `startRate` < `endRate` (price increases over time)
- `targetRaise` reasonable for market size
- `maxPerWallet` prevents whale dominance

### Vesting
- `duration` > `cliff` (if cliff exists)
- Team vesting recommended (prevents dumps)
- Staking vesting recommended (sustainable)

### Security
- `mintAuthority: null` (required for mainnet)
- `freezeAuthority: null` (required for mainnet)
- `lpBurned: true` (required for mainnet)

---

## 🚀 Deployment Workflow

### Pre-Launch Checklist
1. ✅ Config created and validated
2. ✅ Tokenomics reviewed by team
3. ✅ Vesting schedules confirmed
4. ✅ Security settings verified
5. ✅ Tested on devnet
6. ✅ Community announcement ready

### Launch Command
```bash
# Devnet test
node launch.js --config launch-config.json

# Mainnet launch
node launch.js --config launch-config.json --mainnet --self-birth
```

### Post-Launch Verification
1. ✅ Mint authority renounced
2. ✅ Freeze authority renounced
3. ✅ LP tokens burned
4. ✅ Vesting contracts deployed
5. ✅ Pool trading active
6. ✅ Community verification shared

---

## 📞 Support & Resources

**Configuration Generator**: Use `create-launch-config.js`
**Validator**: Use `validate-launch-config.js`
**Templates**: See `/configs` directory
**Documentation**: This file

**Last Updated**: 2026-02-02
**Version**: 1.0
**Status**: Production Ready
