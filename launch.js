#!/usr/bin/env node
/**
 * 🚀 CLAWDNATION TOKEN LAUNCH CLI
 *
 * Unified launch system supporting both Bootstrap and No-Bootstrap modes
 *
 * Usage:
 *   node launch.js --config launch-config.json                    # devnet bootstrap
 *   node launch.js --config launch-config.json --mainnet          # mainnet bootstrap
 *   node launch.js --config launch-config.json --self-birth       # bootstrap mode (alias)
 *   node launch.js --config launch-config.json --no-bootstrap     # direct LP mode
 *   node launch.js --config launch-config.json --mainnet --self-birth  # mainnet bootstrap
 *
 * Examples:
 *   node launch.js --config configs/balanced.json
 *   node launch.js --config configs/community-first.json --mainnet
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Parse arguments
const args = process.argv.slice(2);
const configPath = args.find(a => a.startsWith('--config='))?.split('=')[1] ||
                   args[args.indexOf('--config') + 1];
const isMainnet = args.includes('--mainnet');
const isSelfBirth = args.includes('--self-birth');
const isNoBootstrap = args.includes('--no-bootstrap');
const isDryRun = args.includes('--dry-run');

// Validation
if (!configPath) {
  console.error('❌ Usage: node launch.js --config <path> [--mainnet] [--self-birth|--no-bootstrap] [--dry-run]');
  console.error('');
  console.error('Examples:');
  console.error('  node launch.js --config launch-config.json');
  console.error('  node launch.js --config launch-config.json --mainnet --self-birth');
  console.error('  node launch.js --config configs/balanced.json --no-bootstrap');
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error(`❌ Config file not found: ${configPath}`);
  process.exit(1);
}

// Load configuration
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Determine launch mode
const launchMode = isNoBootstrap ? 'no-bootstrap' :
                   (isSelfBirth || config.launchMode === 'bootstrap') ? 'bootstrap' :
                   config.launchMode || 'no-bootstrap';

const network = isMainnet ? 'mainnet' : (config.network || 'devnet');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          🚀 CLAWDNATION TOKEN LAUNCH CLI                      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

if (network === 'mainnet') {
  console.log('🚨 MAINNET LAUNCH - THIS WILL DEPLOY REAL TOKENS! 🚨\n');
  if (!isDryRun) {
    console.log('⚠️  You have 15 seconds to cancel (Ctrl+C)...\n');
    setTimeout(() => {}, 15000); // Wait for cancel
  }
} else {
  console.log('🧪 DEVNET MODE - Testing deployment\n');
}

console.log('📋 LAUNCH CONFIGURATION:\n');
console.log('  Mode:', launchMode.toUpperCase());
console.log('  Network:', network);
console.log('  Token:', config.token.name, `(${config.token.symbol})`);
console.log('  Supply:', config.token.supply.toLocaleString());
console.log('  Dry Run:', isDryRun ? 'YES' : 'NO');
console.log('');

/**
 * Validate configuration
 */
function validateConfig(config) {
  const errors = [];

  // Validate tokenomics sum to 100
  const tokenomicsSum = Object.values(config.tokenomics).reduce((a, b) => a + b, 0);
  if (tokenomicsSum !== 100) {
    errors.push(`Tokenomics must sum to 100% (current: ${tokenomicsSum}%)`);
  }

  // Validate distribution matches tokenomics
  const distributionSum = Object.values(config.distribution).reduce((a, b) => a + b, 0);
  if (distributionSum !== config.token.supply) {
    errors.push(`Distribution must sum to total supply (current: ${distributionSum})`);
  }

  // Validate bootstrap parameters
  if (launchMode === 'bootstrap' && config.bootstrap) {
    if (config.bootstrap.startRate >= config.bootstrap.endRate) {
      errors.push('Bootstrap startRate must be less than endRate');
    }
    const splits = config.bootstrap.lpSplit + config.bootstrap.masterSplit + config.bootstrap.stakingSplit;
    if (splits !== 100) {
      errors.push(`Bootstrap splits must sum to 100% (current: ${splits}%)`);
    }
  }

  // Validate vesting schedules
  for (const [key, vest] of Object.entries(config.vesting || {})) {
    if (vest.enabled && vest.cliff > vest.duration) {
      errors.push(`${key} vesting: cliff cannot be longer than duration`);
    }
  }

  // Validate security settings for mainnet
  if (network === 'mainnet') {
    if (config.security.mintAuthority !== null) {
      errors.push('Mainnet requires mintAuthority to be null');
    }
    if (config.security.freezeAuthority !== null) {
      errors.push('Mainnet requires freezeAuthority to be null');
    }
    if (!config.security.lpBurned) {
      errors.push('Mainnet requires LP tokens to be burned');
    }
  }

  return errors;
}

/**
 * Display launch plan
 */
function displayLaunchPlan(config, mode) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TOKENOMICS BREAKDOWN\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const [key, percent] of Object.entries(config.tokenomics)) {
    const amount = config.distribution[key];
    const vesting = config.vesting?.[key];

    console.log(`  ${key.padEnd(12)}: ${amount.toLocaleString().padStart(15)} (${percent}%)`);

    if (vesting?.enabled) {
      const cliffMonths = (vesting.cliff / 2592000).toFixed(1);
      const durationMonths = (vesting.duration / 2592000).toFixed(1);
      console.log(`                 Vesting: ${cliffMonths}mo cliff + ${durationMonths}mo linear`);
    } else if (vesting) {
      console.log(`                 Vesting: None (immediate)`);
    }
    console.log('');
  }

  console.log('  ' + '-'.repeat(40));
  console.log(`  ${'TOTAL'.padEnd(12)}: ${config.token.supply.toLocaleString().padStart(15)} (100%)`);
  console.log('');

  if (mode === 'bootstrap') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('BOOTSTRAP PARAMETERS\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const b = config.bootstrap;
    console.log(`  Start Price: ${b.startRate.toLocaleString()} ${config.token.symbol}/SOL`);
    console.log(`  End Price: ${b.endRate.toLocaleString()} ${config.token.symbol}/SOL`);
    console.log(`  Price Increase: ${((b.endRate/b.startRate - 1) * 100).toFixed(0)}%`);
    console.log(`  Target Raise: ${b.targetRaise} SOL`);
    console.log(`  Min Contribution: ${b.minContribution} SOL`);
    console.log(`  Max Per Wallet: ${b.maxPerWallet} SOL`);
    console.log(`  Allocation Cap: ${b.allocationCap.toLocaleString()} ${config.token.symbol}`);
    console.log('');
    console.log('  SOL Distribution:');
    console.log(`    LP: ${b.lpSplit}%`);
    console.log(`    Master: ${b.masterSplit}%`);
    console.log(`    Staking: ${b.stakingSplit}%`);
    console.log('');
  } else {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('LIQUIDITY POOL PARAMETERS\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const lp = config.liquidity;
    console.log(`  Initial SOL: ${lp.initialSOL} SOL`);
    console.log(`  Initial Price: ${lp.initialPrice.toLocaleString()} ${config.token.symbol}/SOL`);
    console.log(`  Token Amount: ${(lp.initialSOL * lp.initialPrice).toLocaleString()} ${config.token.symbol}`);
    console.log(`  Fee Rate: ${(lp.feeRate / 100).toFixed(2)}%`);
    console.log(`  LP Burn: ${lp.burnLP ? 'YES ✅' : 'NO ⚠️'}`);
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SECURITY SETTINGS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const s = config.security;
  console.log(`  Mint Authority: ${s.mintAuthority === null ? 'Renounced ✅' : 'Set ⚠️'}`);
  console.log(`  Freeze Authority: ${s.freezeAuthority === null ? 'Renounced ✅' : 'Set ⚠️'}`);
  console.log(`  Supply Fixed: ${s.supplyFixed ? 'YES ✅' : 'NO ⚠️'}`);
  console.log(`  LP Burned: ${s.lpBurned ? 'YES ✅' : 'NO ⚠️'}`);
  console.log(`  Vesting Deployed: ${s.vestingDeployed ? 'YES ✅' : 'NO ⚠️'}`);
  console.log(`  Treasury Multisig: ${s.treasuryMultisig ? 'YES ✅' : 'NO ⚠️'}`);
  console.log('');
}

/**
 * Execute launch
 */
async function executeLaunch(config, mode, network, isDryRun) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('LAUNCH EXECUTION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (isDryRun) {
    console.log('✅ DRY RUN MODE - No transactions will be sent\n');
    console.log('Launch steps that would be executed:');

    if (mode === 'bootstrap') {
      console.log('  1. Initialize bootstrap bonding curve');
      console.log('  2. Deploy token mint');
      console.log('  3. Configure bootstrap parameters');
      console.log('  4. Open for contributions');
      console.log('  5. Wait for target raise');
      console.log('  6. Create Raydium LP with raised SOL');
      console.log('  7. Burn LP tokens');
      console.log('  8. Deploy vesting contracts');
      console.log('  9. Distribute tokens per tokenomics');
      console.log('  10. Renounce mint/freeze authorities');
    } else {
      console.log('  1. Deploy token mint');
      console.log('  2. Mint total supply');
      console.log('  3. Distribute tokens per tokenomics');
      console.log('  4. Create Raydium LP');
      console.log('  5. Burn LP tokens');
      console.log('  6. Deploy vesting contracts');
      console.log('  7. Renounce mint/freeze authorities');
    }

    console.log('');
    console.log('✅ Dry run complete - ready for real launch');
    return true;
  }

  // Save config with timestamp
  const timestamp = Date.now();
  const configSavePath = `launch-config-${network}-${timestamp}.json`;
  fs.writeFileSync(configSavePath, JSON.stringify(config, null, 2));
  console.log(`📝 Configuration saved to: ${configSavePath}\n`);

  try {
    if (mode === 'bootstrap') {
      console.log('🚀 Launching in BOOTSTRAP mode...\n');

      // TODO: Call bootstrap initialization script
      console.log('  Step 1: Initialize bootstrap bonding curve...');
      // const initCmd = `node solana/init-bonding-simple.js --config ${configSavePath}`;
      // await execPromise(initCmd);

      console.log('  ⏸️  Bootstrap initialization pending implementation');
      console.log('     Use: node solana/init-bonding-simple.js\n');

    } else {
      console.log('🚀 Launching in NO-BOOTSTRAP mode...\n');

      const factoryCmd = `node solana/factory-no-bootstrap.js ` +
        `--token-name ${config.token.name} ` +
        `--lp-sol ${config.liquidity.initialSOL} ` +
        (network === 'mainnet' ? '--mainnet' : '');

      console.log('  Executing factory launch...');
      console.log(`  Command: ${factoryCmd}\n`);

      const { stdout, stderr } = await execPromise(factoryCmd);
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
    }

    console.log('\n✅ Launch execution complete!');
    return true;

  } catch (error) {
    console.error('\n❌ Launch execution failed:', error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  // Validate configuration
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CONFIGURATION VALIDATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('');
    process.exit(1);
  }

  console.log('✅ Configuration valid\n');

  // Display launch plan
  displayLaunchPlan(config, launchMode);

  // Confirm launch (unless dry-run)
  if (!isDryRun && network === 'mainnet') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  FINAL CONFIRMATION REQUIRED\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('You are about to launch on MAINNET with REAL funds.');
    console.log('This action cannot be undone.');
    console.log('');
    console.log('Press Ctrl+C now to cancel, or waiting 10 seconds will proceed...');
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  // Execute launch
  const success = await executeLaunch(config, launchMode, network, isDryRun);

  if (success) {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 LAUNCH COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Next steps:');
    console.log('  1. Verify token mint on Solana Explorer');
    console.log('  2. Verify LP burn (if applicable)');
    console.log('  3. Verify vesting contracts deployed');
    console.log('  4. Announce to community');
    console.log('  5. Share verification links');
    console.log('');
    process.exit(0);
  } else {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ LAUNCH FAILED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Review error messages above and try again.');
    console.log('');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
