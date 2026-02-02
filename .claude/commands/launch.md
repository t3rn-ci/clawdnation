# /launch - Token Launch CLI

Launch a token using ClawdNation's unified launch system. Supports both Bootstrap (bonding curve) and No-Bootstrap (direct LP) modes.

## Quick Start

```bash
# Devnet test with balanced tokenomics
node launch.js --config configs/balanced.json --dry-run

# Bootstrap launch on devnet
node launch.js --config configs/bootstrap.json --self-birth

# No-bootstrap launch on mainnet
node launch.js --config configs/balanced.json --mainnet --no-bootstrap
```

## Configuration Templates

Available in `configs/` directory:
- **balanced.json** - Standard 50/15/15/10/10 allocation
- **bootstrap.json** - Self-birth bonding curve launch
- **community-first.json** - Community-focused 40/10/20/20/10

## Custom Configuration

Create your own config based on `launch-config-template.json`:

1. Copy template: `cp launch-config-template.json my-config.json`
2. Edit tokenomics, vesting, and security settings
3. Validate: `node launch.js --config my-config.json --dry-run`
4. Launch: `node launch.js --config my-config.json`

## Flags

- `--config <path>` - Path to configuration file (required)
- `--mainnet` - Deploy to mainnet (default: devnet)
- `--self-birth` - Use bootstrap/bonding curve mode
- `--no-bootstrap` - Use direct LP mode (default)
- `--dry-run` - Validate config without executing

## Examples

### Bootstrap Launch (Self-Birth)
```bash
# Devnet test
node launch.js --config configs/bootstrap.json --self-birth --dry-run

# Mainnet launch
node launch.js --config configs/bootstrap.json --mainnet --self-birth
```

### No-Bootstrap Launch (Quick Start)
```bash
# Devnet test
node launch.js --config configs/balanced.json --dry-run

# Mainnet launch
node launch.js --config configs/balanced.json --mainnet
```

### Community-First Launch
```bash
node launch.js --config configs/community-first.json --mainnet
```

## Configuration Standards

See `launch-config-standards.md` for:
- Tokenomics templates (A/B/C/D)
- Vesting schedule standards
- Bootstrap parameters
- Security checklist
- Validation rules

## What It Does

### Bootstrap Mode
1. Initialize bonding curve
2. Deploy token mint
3. Configure bootstrap parameters
4. Accept SOL contributions
5. Create LP with raised funds (80/10/10 split)
6. Burn LP tokens
7. Deploy vesting contracts
8. Distribute tokens
9. Renounce authorities

### No-Bootstrap Mode
1. Deploy token mint
2. Mint total supply
3. Distribute per tokenomics
4. Create Raydium LP
5. Burn LP tokens
6. Deploy vesting contracts
7. Renounce authorities

## Verification

After launch:
1. Check token on Solana Explorer
2. Verify LP burn: `node solana/verify-lp-burn.js <LP_MINT>`
3. Verify vesting contracts
4. Share verification links with community

## Safety

- Mainnet launches have 15-second confirmation delay
- All configs validated before execution
- Dry-run mode available for testing
- Detailed execution logs
- Configuration saved with timestamp

## Support

Documentation:
- Launch standards: `launch-config-standards.md`
- Template: `launch-config-template.json`
- Examples: `configs/` directory
- E2E testing: `E2E_TEST_SCENARIO.md`
