/**
 * TOKEN VESTING SETUP - PARAMETRIZABLE
 *
 * Creates vesting schedules for Team and Staking allocations
 * Usage: node setup-vesting.js --mint <TOKEN> [--team-cliff <MONTHS>] [--team-duration <MONTHS>] [--staking-duration <MONTHS>]
 *
 * Defaults (CLWDN Standard):
 * - Team: 6m cliff + 12m linear vest (18 months total)
 * - Staking: 48m linear vest (4 years, no cliff)
 *
 * Bot can override all parameters for custom tokenomics
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, TransactionInstruction } = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  transfer,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Bonfida Token Vesting Program
const VESTING_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// CLWDN STANDARD DEFAULTS
const DEFAULTS = {
  team: {
    cliff: 6,        // 6 months cliff
    duration: 18,    // 18 months total (6 cliff + 12 vest)
    frequency: 1     // Monthly unlock
  },
  staking: {
    cliff: 0,        // No cliff
    duration: 48,    // 48 months (4 years)
    frequency: 1     // Monthly unlock
  }
};

const SECONDS_PER_MONTH = 30 * 24 * 60 * 60; // Approximate

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║       TOKEN VESTING SETUP - PARAMETRIZABLE                 ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

function parseArgs() {
  const args = process.argv.slice(2);

  const config = {
    mint: args.find(a => a.startsWith('--mint='))?.split('=')[1],
    teamCliff: parseInt(args.find(a => a.startsWith('--team-cliff='))?.split('=')[1] || DEFAULTS.team.cliff),
    teamDuration: parseInt(args.find(a => a.startsWith('--team-duration='))?.split('=')[1] || DEFAULTS.team.duration),
    stakingCliff: parseInt(args.find(a => a.startsWith('--staking-cliff='))?.split('=')[1] || DEFAULTS.staking.cliff),
    stakingDuration: parseInt(args.find(a => a.startsWith('--staking-duration='))?.split('=')[1] || DEFAULTS.staking.duration),
    teamPercent: parseFloat(args.find(a => a.startsWith('--team-percent='))?.split('=')[1] || '15'),
    stakingPercent: parseFloat(args.find(a => a.startsWith('--staking-percent='))?.split('=')[1] || '15'),
  };

  return config;
}

async function main() {
  const config = parseArgs();

  if (!config.mint) {
    console.log('❌ Missing required arguments!\n');
    console.log('Usage:');
    console.log('  node setup-vesting.js --mint=<TOKEN_MINT> [OPTIONS]\n');
    console.log('Options (all optional, defaults to CLWDN standard):');
    console.log('  --team-cliff=<MONTHS>        Default: 6');
    console.log('  --team-duration=<MONTHS>     Default: 18 (6 cliff + 12 vest)');
    console.log('  --staking-cliff=<MONTHS>     Default: 0');
    console.log('  --staking-duration=<MONTHS>  Default: 48 (4 years)');
    console.log('  --team-percent=<PCT>         Default: 15');
    console.log('  --staking-percent=<PCT>      Default: 15\n');
    console.log('Examples:\n');
    console.log('  # CLWDN Standard (default):');
    console.log('  node setup-vesting.js --mint=2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx\n');
    console.log('  # Custom: 3m cliff, 12m total, 10% team:');
    console.log('  node setup-vesting.js \\');
    console.log('    --mint=2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx \\');
    console.log('    --team-cliff=3 \\');
    console.log('    --team-duration=12 \\');
    console.log('    --team-percent=10\n');
    process.exit(1);
  }

  const tokenMint = new PublicKey(config.mint);

  console.log('📋 CONFIGURATION:\n');
  console.log('  Token Mint:', tokenMint.toBase58());
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  Vesting Program:', VESTING_PROGRAM.toBase58());
  console.log('');

  console.log('  🏢 TEAM VESTING:');
  console.log('     Allocation:', config.teamPercent + '%');
  console.log('     Cliff:', config.teamCliff, 'months');
  console.log('     Total Duration:', config.teamDuration, 'months');
  console.log('     Vesting Period:', (config.teamDuration - config.teamCliff), 'months');
  console.log('     Unlock Frequency: Monthly');
  console.log('');

  console.log('  💎 STAKING VESTING:');
  console.log('     Allocation:', config.stakingPercent + '%');
  console.log('     Cliff:', config.stakingCliff, 'months', config.stakingCliff === 0 ? '(immediate start)' : '');
  console.log('     Total Duration:', config.stakingDuration, 'months');
  console.log('     Vesting Period:', config.stakingDuration, 'months');
  console.log('     Unlock Frequency: Monthly');
  console.log('');

  const isDefault = config.teamCliff === DEFAULTS.team.cliff &&
                    config.teamDuration === DEFAULTS.team.duration &&
                    config.stakingDuration === DEFAULTS.staking.duration;

  if (isDefault) {
    console.log('  ✅ Using CLWDN Standard defaults');
  } else {
    console.log('  📝 Using custom parameters (bot override)');
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('VESTING IMPLEMENTATION OPTIONS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  OPTION 1: Bonfida Token Vesting (RECOMMENDED)\n');
  console.log('  Battle-tested, used by top Solana projects.');
  console.log('  Program:', VESTING_PROGRAM.toBase58(), '\n');
  console.log('  Install:');
  console.log('  npm install -g @bonfida/token-vesting-cli\n');
  console.log('  Create Team Vesting:');
  console.log('  spl-token-vesting create \\');
  console.log('    --mint', tokenMint.toBase58(), '\\');
  console.log('    --destination <TEAM_BENEFICIARY> \\');
  console.log('    --amount <TEAM_TOKENS> \\');
  console.log('    --start-time $(date +%s) \\');
  console.log('    --cliff-duration', config.teamCliff * SECONDS_PER_MONTH, '\\  # seconds');
  console.log('    --vesting-duration', config.teamDuration * SECONDS_PER_MONTH, '\\  # seconds');
  console.log('    --frequency', SECONDS_PER_MONTH, '\\  # monthly');
  console.log('    --url', RPC.includes('devnet') ? 'devnet' : 'mainnet-beta');
  console.log('');
  console.log('  Create Staking Vesting:');
  console.log('  spl-token-vesting create \\');
  console.log('    --mint', tokenMint.toBase58(), '\\');
  console.log('    --destination <STAKING_BENEFICIARY> \\');
  console.log('    --amount <STAKING_TOKENS> \\');
  console.log('    --start-time $(date +%s) \\');
  console.log('    --cliff-duration 0 \\  # no cliff');
  console.log('    --vesting-duration', config.stakingDuration * SECONDS_PER_MONTH, '\\  # seconds');
  console.log('    --frequency', SECONDS_PER_MONTH, '\\  # monthly');
  console.log('    --url', RPC.includes('devnet') ? 'devnet' : 'mainnet-beta');
  console.log('');

  console.log('  OPTION 2: Streamflow (Alternative)\n');
  console.log('  Modern UI, good for non-technical teams.');
  console.log('  Website: https://streamflow.finance/\n');

  console.log('  OPTION 3: Custom Anchor Contract\n');
  console.log('  Full control, requires Rust development.');
  console.log('  Reference: See VESTING_CONTRACT_TEMPLATE.md\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP-BY-STEP GUIDE (OPTION 1)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  1. Get token balances:\n');
  console.log('     Team tokens (', config.teamPercent + '%)');
  console.log('     Staking tokens (', config.stakingPercent + '%)\n');

  // Check actual balances
  try {
    const teamAccount = await getOrCreateAssociatedTokenAccount(
      conn,
      authority,
      tokenMint,
      authority.publicKey,
      false,
      'confirmed',
      undefined,
      TOKEN_PROGRAM_ID
    );

    const balance = Number(teamAccount.amount) / 1e9;
    const teamAmount = Math.floor(balance * (config.teamPercent / 100));
    const stakingAmount = Math.floor(balance * (config.stakingPercent / 100));

    console.log('     Current balance:', balance.toLocaleString());
    console.log('     Team allocation:', teamAmount.toLocaleString());
    console.log('     Staking allocation:', stakingAmount.toLocaleString());
    console.log('');

    console.log('  2. Create Team vesting contract:');
    console.log('     Tokens:', teamAmount.toLocaleString());
    console.log('     Cliff:', config.teamCliff, 'months =', (config.teamCliff * SECONDS_PER_MONTH).toLocaleString(), 'seconds');
    console.log('     Duration:', config.teamDuration, 'months =', (config.teamDuration * SECONDS_PER_MONTH).toLocaleString(), 'seconds');
    console.log('     Monthly unlock:', Math.floor(teamAmount / (config.teamDuration - config.teamCliff)).toLocaleString(), 'tokens');
    console.log('');

    console.log('  3. Create Staking vesting contract:');
    console.log('     Tokens:', stakingAmount.toLocaleString());
    console.log('     Cliff:', config.stakingCliff, 'months');
    console.log('     Duration:', config.stakingDuration, 'months =', (config.stakingDuration * SECONDS_PER_MONTH).toLocaleString(), 'seconds');
    console.log('     Monthly unlock:', Math.floor(stakingAmount / config.stakingDuration).toLocaleString(), 'tokens');
    console.log('');

  } catch (e) {
    console.log('     ⚠️  Could not fetch balance:', e.message);
    console.log('');
  }

  console.log('  4. Transfer tokens to vesting PDAs');
  console.log('     (Automatically done by vesting CLI)');
  console.log('');

  console.log('  5. Verify vesting schedules:');
  console.log('     spl-token-vesting info <VESTING_ACCOUNT>');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('VESTING TIMELINE VISUALIZATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  TEAM (' + config.teamPercent + '%, ' + config.teamDuration + ' months total):\n');
  console.log('  Month 0        Month ' + config.teamCliff + '                     Month ' + config.teamDuration);
  console.log('  ├──────────────┼──────────────────────────┤');
  console.log('  │   CLIFF      │   LINEAR VESTING         │');
  console.log('  │   (locked)   │   (monthly unlock)       │');
  console.log('  └──────────────┴──────────────────────────┘');
  console.log('');

  console.log('  STAKING (' + config.stakingPercent + '%, ' + config.stakingDuration + ' months):\n');
  if (config.stakingCliff === 0) {
    console.log('  Month 0                                Month ' + config.stakingDuration);
    console.log('  ├────────────────────────────────────────┤');
    console.log('  │        LINEAR VESTING (monthly)        │');
    console.log('  └────────────────────────────────────────┘');
  } else {
    console.log('  Month 0        Month ' + config.stakingCliff + '                     Month ' + config.stakingDuration);
    console.log('  ├──────────────┼──────────────────────────┤');
    console.log('  │   CLIFF      │   LINEAR VESTING         │');
    console.log('  └──────────────┴──────────────────────────┘');
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ VESTING CONFIGURATION COMPLETE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  📝 Configuration saved for bot automation:\n');

  const vestingConfig = {
    tokenMint: tokenMint.toBase58(),
    standard: isDefault ? 'CLWDN' : 'CUSTOM',
    team: {
      percent: config.teamPercent,
      cliffMonths: config.teamCliff,
      durationMonths: config.teamDuration,
      cliffSeconds: config.teamCliff * SECONDS_PER_MONTH,
      durationSeconds: config.teamDuration * SECONDS_PER_MONTH,
      frequencySeconds: SECONDS_PER_MONTH,
    },
    staking: {
      percent: config.stakingPercent,
      cliffMonths: config.stakingCliff,
      durationMonths: config.stakingDuration,
      cliffSeconds: config.stakingCliff * SECONDS_PER_MONTH,
      durationSeconds: config.stakingDuration * SECONDS_PER_MONTH,
      frequencySeconds: SECONDS_PER_MONTH,
    },
    program: VESTING_PROGRAM.toBase58(),
    timestamp: new Date().toISOString(),
  };

  const configPath = path.join(__dirname, `vesting-${tokenMint.toBase58().slice(0, 8)}-config.json`);
  fs.writeFileSync(configPath, JSON.stringify(vestingConfig, null, 2));
  console.log('  Config saved:', configPath);
  console.log('');

  console.log('  🤖 Bot Integration:');
  console.log('  This config can be consumed by automated factory bots');
  console.log('  to create vesting contracts with custom parameters.');
  console.log('');

  console.log('  🔗 Resources:');
  console.log('  - Bonfida CLI: https://github.com/Bonfida/token-vesting');
  console.log('  - Streamflow: https://streamflow.finance/');
  console.log('  - Custom contracts: See VESTING_CONTRACT_TEMPLATE.md');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
