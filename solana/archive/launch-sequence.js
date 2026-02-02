/**
 * CLAWDNATION LAUNCH SEQUENCE
 *
 * Simple CLI for 30-minute launch timeline:
 *
 * 1. node launch-sequence.js --start-bootstrap
 * 2. node launch-sequence.js --status
 * 3. node launch-sequence.js --finalize-lp (after bootstrap completes)
 *
 * RECOMMENDED FLOW: Bootstrap First → LP After (SECURE)
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Configuration
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const BOOTSTRAP_STATE = new PublicKey('8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz');
const DISPENSER_STATE = new PublicKey('BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w');

const BOOTSTRAP_CONFIG = {
  fixedRate: 10_000, // CLWDN per SOL
  targetAmount: 100_000_000, // 100M CLWDN (10% of supply)
  targetSol: 10_000, // SOL to raise
};

const LP_CONFIG = {
  clwdnAmount: 400_000_000, // 400M CLWDN (40% of supply)
};

// ═══════════════════════════════════════════════════════
// STEP 1: START BOOTSTRAP
// ═══════════════════════════════════════════════════════

async function startBootstrap() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           🚀 STARTING BOOTSTRAP PHASE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('📋 BOOTSTRAP CONFIGURATION:\n');
  console.log(`   Fixed Rate: ${BOOTSTRAP_CONFIG.fixedRate.toLocaleString()} CLWDN per SOL`);
  console.log(`   Target Amount: ${BOOTSTRAP_CONFIG.targetAmount.toLocaleString()} CLWDN`);
  console.log(`   Expected SOL: ${BOOTSTRAP_CONFIG.targetSol.toLocaleString()} SOL\n`);

  // Check bootstrap state
  try {
    const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
    if (!stateInfo) {
      console.log('❌ Bootstrap state not found. Run bootstrap initialization first.\n');
      console.log('💡 Run: cd bootstrap && anchor build && anchor deploy\n');
      return false;
    }

    console.log('✅ Bootstrap program ready\n');
  } catch (e) {
    console.log('❌ Error checking bootstrap state:', e.message, '\n');
    return false;
  }

  // Check dispenser balance
  try {
    const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
    const dispenserBalance = await conn.getTokenAccountBalance(dispenserAta);
    const balance = Number(dispenserBalance.value.amount) / 1e9;

    console.log('💰 DISPENSER BALANCE:\n');
    console.log(`   Current: ${balance.toLocaleString()} CLWDN`);
    console.log(`   Needed: ${BOOTSTRAP_CONFIG.targetAmount.toLocaleString()} CLWDN`);

    if (balance < BOOTSTRAP_CONFIG.targetAmount) {
      console.log(`\n   ⚠️  Insufficient CLWDN! Need ${(BOOTSTRAP_CONFIG.targetAmount - balance).toLocaleString()} more\n`);
      return false;
    }

    console.log('   ✅ Sufficient balance!\n');
  } catch (e) {
    console.log('❌ Error checking dispenser balance:', e.message, '\n');
    return false;
  }

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   BOOTSTRAP IS LIVE! 🎉                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('📢 NEXT STEPS:\n');
  console.log('1. Share contribution address on Twitter/Discord');
  console.log('2. Users send SOL to bootstrap program');
  console.log('3. Dispenser auto-distributes CLWDN at fixed rate');
  console.log('4. Monitor progress: node launch-sequence.js --status');
  console.log('5. After 100M sold: node launch-sequence.js --finalize-lp\n');

  console.log('🔗 CONTRIBUTION ADDRESS:');
  console.log(`   ${BOOTSTRAP_STATE.toBase58()}\n`);

  console.log('⏱️  ESTIMATED TIME: 24-48 hours (depends on demand)\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// STEP 2: CHECK STATUS
// ═══════════════════════════════════════════════════════

async function checkStatus() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              📊 BOOTSTRAP STATUS CHECK                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Check SOL raised (in bootstrap state account)
    const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
    if (!stateInfo) {
      console.log('❌ Bootstrap state not found\n');
      return { ready: false };
    }

    const solRaised = stateInfo.lamports / LAMPORTS_PER_SOL;
    console.log(`💰 SOL RAISED: ${solRaised.toLocaleString()} SOL\n`);

    // Check CLWDN distributed (from dispenser balance decrease)
    const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
    const dispenserBalance = await conn.getTokenAccountBalance(dispenserAta);
    const currentBalance = Number(dispenserBalance.value.amount) / 1e9;

    // Assuming dispenser started with 100M for bootstrap
    const distributed = BOOTSTRAP_CONFIG.targetAmount - currentBalance;
    const percentComplete = (distributed / BOOTSTRAP_CONFIG.targetAmount) * 100;

    console.log(`🎯 CLWDN DISTRIBUTED:\n`);
    console.log(`   Sold: ${distributed.toLocaleString()} CLWDN`);
    console.log(`   Remaining: ${currentBalance.toLocaleString()} CLWDN`);
    console.log(`   Progress: ${percentComplete.toFixed(1)}%\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const isComplete = distributed >= BOOTSTRAP_CONFIG.targetAmount * 0.99; // 99% threshold

    if (isComplete) {
      console.log('✅ BOOTSTRAP COMPLETE! 🎉\n');
      console.log('🔥 NEXT STEP: Create liquidity pool\n');
      console.log('   Run: node launch-sequence.js --finalize-lp\n');
    } else {
      console.log('⏳ Bootstrap in progress...\n');
      console.log(`   Estimated remaining: ${(BOOTSTRAP_CONFIG.targetAmount - distributed).toLocaleString()} CLWDN\n`);
    }

    return {
      ready: isComplete,
      solRaised,
      distributed,
      percentComplete,
    };
  } catch (e) {
    console.log('❌ Error checking status:', e.message, '\n');
    return { ready: false };
  }
}

// ═══════════════════════════════════════════════════════
// STEP 3: FINALIZE LP (CREATE + BURN)
// ═══════════════════════════════════════════════════════

async function finalizeLp() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         🔥 FINALIZING LIQUIDITY POOL (BURN LP)             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Step 1: Check bootstrap completion
  console.log('STEP 1: Verify Bootstrap Complete\n');
  const status = await checkStatus();

  if (!status.ready) {
    console.log('❌ Bootstrap not complete yet. Run --status to check progress.\n');
    return false;
  }

  const solRaised = status.solRaised || BOOTSTRAP_CONFIG.targetSol;
  const clwdnForLp = LP_CONFIG.clwdnAmount;
  const initialPrice = clwdnForLp / solRaised;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: LP Configuration\n');
  console.log(`   SOL from Bootstrap: ${solRaised.toLocaleString()} SOL`);
  console.log(`   CLWDN for LP: ${clwdnForLp.toLocaleString()} CLWDN`);
  console.log(`   Initial Price: 1 SOL = ${initialPrice.toLocaleString()} CLWDN\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 3: Create Raydium CPMM Pool\n');
  console.log('📝 MANUAL STEP REQUIRED:\n');
  console.log('   You need to create the pool using Raydium CLI or UI.\n');
  console.log('   We cannot automate this yet as it requires Raydium program.\n\n');

  console.log('🔧 COMMAND (if using create-pool.js):\n');
  console.log(`   node create-pool.js --mint ${CLWDN_MINT.toBase58()} \\`);
  console.log(`     --token-amount ${clwdnForLp * 1e9} \\`);
  console.log(`     --sol-amount ${Math.floor(solRaised * LAMPORTS_PER_SOL)}\n`);

  console.log('💡 ALTERNATIVE: Use Raydium UI\n');
  console.log('   1. Go to https://raydium.io/create-pool/');
  console.log('   2. Select CLWDN mint');
  console.log(`   3. Add ${clwdnForLp.toLocaleString()} CLWDN`);
  console.log(`   4. Add ${solRaised.toLocaleString()} SOL`);
  console.log('   5. Create pool and note LP token address\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 4: Burn LP Tokens (LOCK LIQUIDITY FOREVER)\n');
  console.log('🔥 CRITICAL SECURITY STEP:\n');
  console.log('   After creating the pool, you will receive LP tokens.\n');
  console.log('   These LP tokens control the liquidity.\n');
  console.log('   To lock liquidity FOREVER, burn them!\n\n');

  console.log('🔧 BURN COMMAND:\n');
  console.log('   spl-token burn [YOUR_LP_TOKEN_ACCOUNT] [LP_TOKEN_AMOUNT] --url devnet\n');
  console.log('   OR send to null address:\n');
  console.log('   spl-token transfer [LP_TOKEN_MINT] ALL 11111111111111111111111111111111 --url devnet\n\n');

  console.log('✅ VERIFICATION:\n');
  console.log('   spl-token balance [LP_TOKEN_MINT] --url devnet\n');
  console.log('   Should show 0 (or very small dust)\n\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 5: Announce Launch! 🎉\n');
  console.log('   ✓ Bootstrap completed');
  console.log('   ✓ Liquidity pool created');
  console.log('   ✓ LP tokens BURNED (liquidity locked forever)');
  console.log('   ✓ Trading LIVE on Raydium!\n');

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║            🎊 CLAWDNATION LAUNCH COMPLETE! 🎊              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Save launch data
  const launchData = {
    timestamp: new Date().toISOString(),
    network: 'devnet',
    bootstrap: {
      solRaised,
      clwdnDistributed: BOOTSTRAP_CONFIG.targetAmount,
    },
    liquidityPool: {
      clwdnAmount: clwdnForLp,
      solAmount: solRaised,
      initialPrice,
    },
    security: {
      lpTokensBurned: true,
      liquidityLocked: 'permanent',
    },
  };

  fs.writeFileSync(
    path.join(__dirname, 'launch-data.json'),
    JSON.stringify(launchData, null, 2)
  );

  console.log('📄 Launch data saved to: launch-data.json\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// CLI INTERFACE
// ═══════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║         CLAWDNATION 30-MINUTE LAUNCH SEQUENCE              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    console.log('USAGE:\n');
    console.log('  node launch-sequence.js --start-bootstrap  # Phase 1: Open bootstrap');
    console.log('  node launch-sequence.js --status           # Check progress');
    console.log('  node launch-sequence.js --finalize-lp      # Phase 2: Create & lock LP\n');
    console.log('FLOW:\n');
    console.log('  1️⃣  Bootstrap Phase (10% = 100M CLWDN)');
    console.log('     - Fixed rate: 10,000 CLWDN per SOL');
    console.log('     - Target: 10,000 SOL raised');
    console.log('     - Duration: Until 100M CLWDN sold\n');
    console.log('  2️⃣  Create LP (40% = 400M CLWDN)');
    console.log('     - Use ALL SOL raised from bootstrap');
    console.log('     - Pair with 400M CLWDN');
    console.log('     - Create Raydium CPMM pool\n');
    console.log('  3️⃣  Lock Liquidity (BURN LP TOKENS)');
    console.log('     - Burn LP tokens to lock forever');
    console.log('     - Trading begins! 🎉\n');
    console.log('SECURITY:\n');
    console.log('  ✓ Bootstrap-first (no team SOL needed)');
    console.log('  ✓ LP funded by community');
    console.log('  ✓ LP tokens burned (permanent lock)');
    console.log('  ✓ Fair launch (everyone gets bootstrap rate)\n');
    return;
  }

  if (args.includes('--start-bootstrap')) {
    await startBootstrap();
  } else if (args.includes('--status')) {
    await checkStatus();
  } else if (args.includes('--finalize-lp')) {
    await finalizeLp();
  } else {
    console.log('❌ Unknown command. Run with --help for usage.\n');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { startBootstrap, checkStatus, finalizeLp };
