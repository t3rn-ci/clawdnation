/**
 * BOOTSTRAP WITH PROGRESSIVE LP
 *
 * Minimal LP is seeded FROM bootstrap contributions (no team SOL needed!)
 *
 * Phase 0: Bootstrap starts (NO LP yet)
 *   - Users send SOL to Bootstrap address
 *   - First X SOL collected
 *
 * Phase 1: Create Minimal LP (from first contributions)
 *   - Take first 10-100 SOL from bootstrap
 *   - Create minimal LP: X SOL + (X * 40K) CLWDN
 *   - Trading enabled!
 *
 * Phase 2: Continue Bootstrap
 *   - Remaining contributions go to treasury
 *   - CLWDN distributed at fixed rate
 *   - Target: 100-10,000 SOL total
 *
 * Phase 3: Add Full Liquidity
 *   - Take all raised SOL from treasury
 *   - Add to LP with remaining CLWDN
 *   - Burn ALL LP tokens → locked forever 🔒
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
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
const BOOTSTRAP_STATE = new PublicKey('8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz');
const DISPENSER_STATE = new PublicKey('BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w');

// Default configuration
const DEFAULT_CONFIG = {
  raiseTarget: 100, // Default 100 SOL (can be overridden to 10K)
  minimalLpSeed: 10, // Use first 10 SOL for minimal LP (10% of default raise)
  bootstrapRate: 10_000, // 1 SOL = 10K CLWDN
  lpRate: 40_000, // 1 SOL = 40K CLWDN (in LP)
  bootstrapAllocation: 100_000_000, // 100M CLWDN
  lpAllocation: 400_000_000, // 400M CLWDN
};

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   BOOTSTRAP-FUNDED PROGRESSIVE LP (NO TEAM SOL!)           ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════
// PARSE ARGS
// ═══════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  // Check for --raise-target
  const targetIndex = args.indexOf('--raise-target');
  if (targetIndex !== -1 && args[targetIndex + 1]) {
    config.raiseTarget = parseInt(args[targetIndex + 1]);
    config.minimalLpSeed = Math.max(10, Math.floor(config.raiseTarget * 0.1)); // 10% of target
  }

  return config;
}

// ═══════════════════════════════════════════════════════
// PHASE 0: START BOOTSTRAP (COLLECT INITIAL SOL)
// ═══════════════════════════════════════════════════════

async function phase0_startBootstrap(config) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 0: START BOOTSTRAP (NO LP YET)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('🎯 BOOTSTRAP CONFIGURATION:\n');
  console.log(`   Raise Target: ${config.raiseTarget.toLocaleString()} SOL`);
  console.log(`   Bootstrap Distribution: ${config.bootstrapAllocation.toLocaleString()} CLWDN`);
  console.log(`   Fixed Rate: ${config.bootstrapRate.toLocaleString()} CLWDN per SOL\n`);

  console.log('💡 PROGRESSIVE LP STRATEGY:\n');
  console.log(`   First ${config.minimalLpSeed} SOL → Create minimal LP`);
  console.log(`   Remaining ${config.raiseTarget - config.minimalLpSeed} SOL → Treasury`);
  console.log(`   After raise complete → Add all to LP\n`);

  console.log('✅ NO TEAM SOL NEEDED:\n');
  console.log('   LP is funded entirely by bootstrap contributors!');
  console.log('   Community provides 100% of liquidity\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check bootstrap state
  const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!stateInfo) {
    console.log('❌ Bootstrap state not initialized\n');
    return { ready: false };
  }

  console.log('✅ Bootstrap program ready\n');

  // Check dispenser
  const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
  try {
    const balance = await conn.getTokenAccountBalance(dispenserAta);
    const balanceAmount = Number(balance.value.amount) / 1e9;

    console.log('💰 DISPENSER STATUS:\n');
    console.log(`   Balance: ${balanceAmount.toLocaleString()} CLWDN`);
    console.log(`   Needed: ${config.bootstrapAllocation.toLocaleString()} CLWDN\n`);

    if (balanceAmount < config.bootstrapAllocation) {
      console.log(`   ⚠️  Need ${(config.bootstrapAllocation - balanceAmount).toLocaleString()} more\n`);
    } else {
      console.log('   ✅ Sufficient for bootstrap!\n');
    }
  } catch (e) {
    console.log('⚠️  Could not check dispenser:', e.message, '\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📢 SHARE ON TWITTER:\n');
  console.log(`   "🎉 CLAWDNATION BOOTSTRAP IS LIVE!\\n`);
  console.log(`   💰 Rate: ${config.bootstrapRate.toLocaleString()} CLWDN per SOL\\n`);
  console.log(`   🎯 Target: ${config.raiseTarget.toLocaleString()} SOL\\n`);
  console.log(`   📍 Send SOL to: ${BOOTSTRAP_STATE.toBase58().slice(0, 20)}...\\n`);
  console.log(`   💎 100% community-funded liquidity!"`);
  console.log('\n');

  console.log('🔗 BOOTSTRAP ADDRESS:\n');
  console.log(`   ${BOOTSTRAP_STATE.toBase58()}\n`);

  console.log('⏳ WAITING FOR CONTRIBUTIONS:\n');
  console.log(`   Need ${config.minimalLpSeed} SOL to create minimal LP`);
  console.log('   Monitor: --check-lp-ready\n');

  return { ready: true, config };
}

// ═══════════════════════════════════════════════════════
// CHECK IF READY TO CREATE MINIMAL LP
// ═══════════════════════════════════════════════════════

async function checkLpReady(config) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CHECK: READY FOR MINIMAL LP?');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check SOL in bootstrap state (treasury)
  const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!stateInfo) {
    console.log('❌ Bootstrap state not found\n');
    return { ready: false };
  }

  const solCollected = stateInfo.lamports / LAMPORTS_PER_SOL;

  console.log('💰 SOL COLLECTED:\n');
  console.log(`   Current: ${solCollected.toFixed(4)} SOL`);
  console.log(`   Needed for LP: ${config.minimalLpSeed} SOL\n`);

  if (solCollected >= config.minimalLpSeed) {
    console.log('✅ READY TO CREATE MINIMAL LP! 🎉\n');
    console.log('🔥 NEXT STEP:\n');
    console.log('   node bootstrap-progressive-lp.js --create-minimal-lp\n');
    return { ready: true, solCollected };
  } else {
    const remaining = config.minimalLpSeed - solCollected;
    console.log(`⏳ Need ${remaining.toFixed(4)} more SOL\n`);
    console.log('   Keep monitoring or share bootstrap address more!\n');
    return { ready: false, solCollected, remaining };
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 1: CREATE MINIMAL LP (FROM BOOTSTRAP SOL)
// ═══════════════════════════════════════════════════════

async function phase1_createMinimalLp(config) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 1: CREATE MINIMAL LP (FROM BOOTSTRAP)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verify enough SOL collected
  const readyCheck = await checkLpReady(config);
  if (!readyCheck.ready) {
    console.log('❌ Not enough SOL collected yet\n');
    return false;
  }

  const lpSol = config.minimalLpSeed;
  const lpClwdn = lpSol * config.lpRate; // e.g., 10 SOL * 40K = 400K CLWDN

  console.log('📋 MINIMAL LP CONFIGURATION:\n');
  console.log(`   SOL: ${lpSol} SOL (from bootstrap)`);
  console.log(`   CLWDN: ${lpClwdn.toLocaleString()} CLWDN`);
  console.log(`   Price: 1 SOL = ${config.lpRate.toLocaleString()} CLWDN\n`);

  console.log('🎯 THIS IS FUNDED BY COMMUNITY:\n');
  console.log('   ✓ No team SOL used');
  console.log('   ✓ First contributors provide LP seed');
  console.log('   ✓ Fair launch from day 0\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 STEPS TO CREATE LP:\n');

  console.log('STEP 1: Transfer SOL from Bootstrap to Authority\n');
  console.log('   The bootstrap program holds the SOL.');
  console.log('   You (authority) need to transfer it to create LP.\n');
  console.log('   ⚠️  This requires a withdrawal mechanism in Bootstrap program!\n');

  console.log('   FEASIBILITY CHECK:\n');
  console.log('   Current Bootstrap program does NOT have withdrawal function.');
  console.log('   Options:');
  console.log('     A) Add withdraw_for_lp() instruction to Bootstrap');
  console.log('     B) Use treasury wallet (SOL goes there directly)\n');

  console.log('   RECOMMENDED: Option B (Treasury Wallet)\n');
  console.log('   Bootstrap already sends SOL to treasury wallet.');
  console.log('   Use that SOL to create LP!\n');

  console.log('STEP 2: Check Treasury Balance\n');

  // Get treasury from bootstrap state (if we could parse it)
  // For now, show manual command
  console.log('   Command:');
  console.log('   solana balance [TREASURY_WALLET] --url devnet\n');

  console.log('STEP 3: Transfer CLWDN to Authority\n');
  console.log(`   Need ${lpClwdn.toLocaleString()} CLWDN for LP\n`);
  console.log('   Command:');
  console.log(`   spl-token transfer ${CLWDN_MINT.toBase58()} \\`);
  console.log(`     ${lpClwdn} \\`);
  console.log(`     ${authority.publicKey.toBase58()} \\`);
  console.log('     --url devnet --fund-recipient\n');

  console.log('STEP 4: Create Raydium Pool\n');
  console.log('   Go to: https://raydium.io/liquidity/create/');
  console.log('   Connect treasury wallet');
  console.log('   Select WSOL / CLWDN');
  console.log(`   Add ${lpSol} SOL`);
  console.log(`   Add ${lpClwdn.toLocaleString()} CLWDN`);
  console.log('   Create pool\n');

  console.log('STEP 5: Save LP Info\n');
  console.log('   Note pool address');
  console.log('   Note LP mint');
  console.log('   KEEP LP tokens (don\'t burn yet!)\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ AFTER LP CREATED:\n');
  console.log('   🎊 Trading is LIVE!');
  console.log('   📊 Users can trade while bootstrap continues');
  console.log('   💰 Bootstrap continues collecting remaining SOL\n');

  console.log('📢 ANNOUNCE:\n');
  console.log('   "🎊 CLAWDNATION LP IS LIVE!\\n');
  console.log('   💎 Community-funded liquidity (no team SOL!)\\n');
  console.log('   📊 Trade now on Raydium\\n');
  console.log('   💰 Bootstrap still open (more liquidity coming!)"\n\n');

  return { success: true, lpSol, lpClwdn };
}

// ═══════════════════════════════════════════════════════
// PHASE 2: MONITOR BOOTSTRAP PROGRESS
// ═══════════════════════════════════════════════════════

async function phase2_monitorBootstrap(config) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 2: BOOTSTRAP PROGRESS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check SOL raised
  const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!stateInfo) {
    console.log('❌ Bootstrap state not found\n');
    return { complete: false };
  }

  const solRaised = stateInfo.lamports / LAMPORTS_PER_SOL;

  // Check CLWDN distributed
  const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
  try {
    const balance = await conn.getTokenAccountBalance(dispenserAta);
    const currentBalance = Number(balance.value.amount) / 1e9;
    const distributed = Math.max(0, config.bootstrapAllocation - currentBalance);
    const percentComplete = (distributed / config.bootstrapAllocation) * 100;

    console.log('📊 BOOTSTRAP STATUS:\n');
    console.log(`   Target: ${config.raiseTarget} SOL`);
    console.log(`   Raised: ~${solRaised.toFixed(2)} SOL (${((solRaised / config.raiseTarget) * 100).toFixed(1)}%)`);
    console.log(`   CLWDN Distributed: ${distributed.toLocaleString()} / ${config.bootstrapAllocation.toLocaleString()}`);
    console.log(`   Progress: ${percentComplete.toFixed(1)}%\n`);

    const isComplete = solRaised >= config.raiseTarget || percentComplete >= 99;

    if (isComplete) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ BOOTSTRAP COMPLETE! 🎉\n');
      console.log('🔥 NEXT: Add all raised SOL to LP\n');
      console.log('   Run: node bootstrap-progressive-lp.js --add-final-liquidity\n');
    } else {
      console.log('⏳ Bootstrap ongoing...\n');
      console.log('   Keep sharing bootstrap address!');
      console.log('   LP is already trading while we collect more!\n');
    }

    return {
      complete: isComplete,
      solRaised,
      distributed,
      percentComplete,
    };
  } catch (e) {
    console.log('⚠️  Error:', e.message, '\n');
    return { complete: false, solRaised };
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 3: ADD FINAL LIQUIDITY
// ═══════════════════════════════════════════════════════

async function phase3_addFinalLiquidity(config, poolAddress) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 3: ADD FINAL LIQUIDITY TO POOL');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check completion
  const status = await phase2_monitorBootstrap(config);
  if (!status.complete) {
    console.log('⚠️  Bootstrap not complete\n');
    return false;
  }

  const raisedSol = status.solRaised || config.raiseTarget;
  const minimalLpSol = config.minimalLpSeed;
  const minimalLpClwdn = minimalLpSol * config.lpRate;

  const additionalSol = raisedSol - minimalLpSol; // Remaining SOL
  const additionalClwdn = config.lpAllocation - minimalLpClwdn; // Remaining CLWDN

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 LIQUIDITY ADDITION:\n');
  console.log('   CURRENT LP (minimal):');
  console.log(`     SOL: ${minimalLpSol} SOL`);
  console.log(`     CLWDN: ${minimalLpClwdn.toLocaleString()} CLWDN\n`);
  console.log('   ADDING (from bootstrap):');
  console.log(`     SOL: ${additionalSol.toFixed(2)} SOL`);
  console.log(`     CLWDN: ${additionalClwdn.toLocaleString()} CLWDN\n`);
  console.log('   FINAL LP:');
  console.log(`     SOL: ${raisedSol.toFixed(2)} SOL`);
  console.log(`     CLWDN: ${config.lpAllocation.toLocaleString()} CLWDN\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!poolAddress) {
    console.log('❌ Pool address required\n');
    console.log('USAGE:');
    console.log('   node bootstrap-progressive-lp.js --add-final-liquidity [POOL]\n');
    return false;
  }

  console.log(`📍 Pool: ${poolAddress}\n`);

  console.log('🔨 ADD LIQUIDITY VIA RAYDIUM:\n');
  console.log('   1. Go to: https://raydium.io/liquidity/');
  console.log(`   2. Find pool: ${poolAddress}`);
  console.log('   3. Click "Add Liquidity"');
  console.log(`   4. Add ${additionalSol.toFixed(2)} SOL`);
  console.log(`   5. Add ${additionalClwdn.toLocaleString()} CLWDN`);
  console.log('   6. Confirm\n');

  console.log('✅ AFTER ADDING:\n');
  console.log('   You now hold ALL LP tokens (initial + new)');
  console.log('   Time to lock liquidity forever!\n');

  console.log('🔥 NEXT: node bootstrap-progressive-lp.js --burn-all-lp [LP_MINT]\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// PHASE 4: BURN ALL LP TOKENS
// ═══════════════════════════════════════════════════════

async function phase4_burnAllLp(lpMint) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 4: BURN ALL LP TOKENS (LOCK FOREVER)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!lpMint) {
    console.log('❌ LP mint required\n');
    console.log('USAGE:');
    console.log('   node bootstrap-progressive-lp.js --burn-all-lp [LP_MINT]\n');
    return false;
  }

  console.log(`🔥 LP Mint: ${lpMint}\n`);

  console.log('⚠️  FINAL WARNING:\n');
  console.log('   This PERMANENTLY locks all liquidity');
  console.log('   NO ONE can remove it (including you!)');
  console.log('   Pool will exist forever\n');

  console.log('✅ PRE-BURN CHECKLIST:\n');
  console.log('   [ ] Bootstrap complete');
  console.log('   [ ] All liquidity added to pool');
  console.log('   [ ] Trading works correctly');
  console.log('   [ ] Price is reasonable');
  console.log('   [ ] You hold ALL LP tokens\n');

  console.log('🔥 BURN STEPS:\n');
  console.log(`   1. Find accounts: spl-token accounts ${lpMint} --url devnet`);
  console.log('   2. Burn each: spl-token burn [ACCOUNT] ALL --url devnet');
  console.log(`   3. Verify: spl-token balance ${lpMint} --url devnet (should be 0)\n`);

  console.log('🎊 AFTER BURN:\n');
  console.log('   📢 Tweet: "🔥 ALL LP TOKENS BURNED!\\n');
  console.log('   💎 100% community-funded liquidity LOCKED FOREVER\\n');
  console.log('   🚫 No rug pull possible\\n');
  console.log('   ✅ CLAWDNATION fully launched!"\n\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// SHOW FEASIBILITY ANALYSIS
// ═══════════════════════════════════════════════════════

function showFeasibility() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              FEASIBILITY ANALYSIS                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('✅ WHAT WORKS:\n');
  console.log('   1. Bootstrap collects SOL from users ✅');
  console.log('      → contribute_sol() transfers to treasury\n');

  console.log('   2. Treasury wallet holds all SOL ✅');
  console.log('      → Authority controls treasury\n');

  console.log('   3. Authority can use treasury SOL for LP ✅');
  console.log('      → Transfer from treasury to create pool\n');

  console.log('   4. Progressive liquidity addition works ✅');
  console.log('      → Raydium supports adding to existing pools\n');

  console.log('   5. LP token burning is standard ✅');
  console.log('      → spl-token burn command\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⚠️  CONSIDERATIONS:\n');

  console.log('   1. Manual LP creation required');
  console.log('      → Cannot auto-create from Bootstrap program');
  console.log('      → Need to use Raydium UI/CLI manually');
  console.log('      → SOLUTION: Use authority wallet + Raydium UI\n');

  console.log('   2. Timing of minimal LP creation');
  console.log('      → Need to wait for first X SOL');
  console.log('      → Manual monitoring required');
  console.log('      → SOLUTION: Use --check-lp-ready command\n');

  console.log('   3. Treasury wallet management');
  console.log('      → Authority must have access to treasury');
  console.log('      → Treasury should be hot wallet during launch');
  console.log('      → SOLUTION: Use same wallet as authority initially\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎯 RECOMMENDED SETUP:\n');
  console.log('   1. Treasury = Authority wallet (during launch)');
  console.log('   2. Bootstrap collects to this wallet');
  console.log('   3. Use same wallet to create/add to LP');
  console.log('   4. After launch, transfer treasury to multisig\n');

  console.log('✅ CONCLUSION: FULLY FEASIBLE!\n');
  console.log('   This approach works with existing Bootstrap program.');
  console.log('   No program changes needed!');
  console.log('   100% community-funded liquidity.\n');
}

// ═══════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const config = parseArgs();

  if (args.includes('--help') || args.length === 0) {
    console.log('BOOTSTRAP-FUNDED PROGRESSIVE LP\n');
    console.log('Creates LP entirely from bootstrap contributions (no team SOL!)\n');
    console.log('OPTIONS:\n');
    console.log('  --raise-target [SOL]          Set raise target (default: 100 SOL)\n');
    console.log('COMMANDS:\n');
    console.log('  --start-bootstrap             Start bootstrap phase');
    console.log('  --check-lp-ready              Check if enough SOL for minimal LP');
    console.log('  --create-minimal-lp           Create minimal LP from first SOL');
    console.log('  --status                      Check bootstrap progress');
    console.log('  --add-final-liquidity [POOL]  Add all raised SOL to pool');
    console.log('  --burn-all-lp [MINT]          Burn LP tokens (lock forever)');
    console.log('  --feasibility                 Show feasibility analysis');
    console.log('  --help                        Show this help\n');
    console.log('EXAMPLE (100 SOL raise):\n');
    console.log('  node bootstrap-progressive-lp.js --start-bootstrap');
    console.log('  node bootstrap-progressive-lp.js --check-lp-ready');
    console.log('  # When 10 SOL collected:');
    console.log('  node bootstrap-progressive-lp.js --create-minimal-lp');
    console.log('  # Create pool via Raydium UI...');
    console.log('  node bootstrap-progressive-lp.js --status');
    console.log('  # When 100 SOL raised:');
    console.log('  node bootstrap-progressive-lp.js --add-final-liquidity [POOL]');
    console.log('  node bootstrap-progressive-lp.js --burn-all-lp [MINT]\n');
    console.log('EXAMPLE (10K SOL raise):\n');
    console.log('  node bootstrap-progressive-lp.js --raise-target 10000 --start-bootstrap');
    console.log('  # First 1000 SOL → minimal LP, then 9000 SOL added at end\n');
    return;
  }

  if (args.includes('--start-bootstrap')) {
    await phase0_startBootstrap(config);
  } else if (args.includes('--check-lp-ready')) {
    await checkLpReady(config);
  } else if (args.includes('--create-minimal-lp')) {
    await phase1_createMinimalLp(config);
  } else if (args.includes('--status')) {
    await phase2_monitorBootstrap(config);
  } else if (args.includes('--add-final-liquidity')) {
    const poolAddress = args[args.indexOf('--add-final-liquidity') + 1];
    await phase3_addFinalLiquidity(config, poolAddress);
  } else if (args.includes('--burn-all-lp')) {
    const lpMint = args[args.indexOf('--burn-all-lp') + 1];
    await phase4_burnAllLp(lpMint);
  } else if (args.includes('--feasibility')) {
    showFeasibility();
  } else {
    console.log('Unknown command. Use --help for usage.\n');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  phase0_startBootstrap,
  checkLpReady,
  phase1_createMinimalLp,
  phase2_monitorBootstrap,
  phase3_addFinalLiquidity,
  phase4_burnAllLp,
};
