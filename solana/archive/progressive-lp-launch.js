/**
 * PROGRESSIVE LP LAUNCH
 *
 * Day 0: Create MINIMAL LP pool (enables trading immediately)
 *   - Small initial: 10 SOL + 400K CLWDN (1% of LP allocation)
 *   - Establishes initial price: 1 SOL = 40K CLWDN
 *   - Trading LIVE from Day 0
 *
 * Day 0-X: Bootstrap runs in parallel
 *   - Users contribute SOL
 *   - Get CLWDN at 10K per SOL (arbitrage opportunity!)
 *   - Distribute 100M CLWDN
 *   - Collect SOL in treasury
 *
 * Day X: Add raised liquidity to pool
 *   - Add ALL raised SOL (e.g., 10K SOL)
 *   - Add remaining CLWDN (399.6M)
 *   - Pool now has full liquidity
 *
 * Day X: Burn ALL LP tokens
 *   - Locks liquidity FOREVER 🔒
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
const CLWDN_MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');
const BOOTSTRAP_STATE = new PublicKey('8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz');
const DISPENSER_STATE = new PublicKey('BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w');

const CONFIG = {
  initialLp: {
    sol: 10, // Start with 10 SOL
    clwdn: 400_000, // 400K CLWDN (0.4M)
    pricePerSol: 40_000, // 1 SOL = 40K CLWDN
  },
  bootstrap: {
    clwdn: 100_000_000, // 100M CLWDN distribution
    ratePerSol: 10_000, // 1 SOL = 10K CLWDN (arbitrage!)
    targetSol: 10_000, // Target 10K SOL
  },
  finalLp: {
    clwdn: 399_600_000, // Remaining 399.6M CLWDN
    // SOL amount = whatever bootstrap raised
  },
};

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║        PROGRESSIVE LP LAUNCH: Minimal → Full              ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════
// PHASE 0: CREATE MINIMAL INITIAL LP
// ═══════════════════════════════════════════════════════

async function phase0_createMinimalLp() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 0: CREATE MINIMAL INITIAL LP');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📋 INITIAL LP CONFIGURATION:\n');
  console.log(`   SOL Amount: ${CONFIG.initialLp.sol} SOL (from team)`);
  console.log(`   CLWDN Amount: ${CONFIG.initialLp.clwdn.toLocaleString()} CLWDN`);
  console.log(`   Initial Price: 1 SOL = ${CONFIG.initialLp.pricePerSol.toLocaleString()} CLWDN\n`);

  console.log('🎯 PURPOSE:\n');
  console.log('   ✓ Enables trading from Day 0');
  console.log('   ✓ Establishes initial price point');
  console.log('   ✓ Allows price discovery during bootstrap');
  console.log('   ✓ Small enough to not require huge team investment\n');

  console.log('⚠️  ARBITRAGE WARNING:\n');
  console.log('   Bootstrap rate: 1 SOL = 10K CLWDN');
  console.log('   LP rate: 1 SOL = 40K CLWDN');
  console.log('   → 4x difference creates arbitrage opportunity!');
  console.log('   → Expected: LP price will move toward bootstrap rate\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check authority balances
  console.log('💰 CHECKING AUTHORITY BALANCES:\n');

  // SOL balance
  const solBalance = await conn.getBalance(authority.publicKey);
  const solBalanceInSol = solBalance / LAMPORTS_PER_SOL;
  console.log(`   SOL: ${solBalanceInSol.toFixed(4)} SOL`);

  if (solBalanceInSol < CONFIG.initialLp.sol + 0.1) {
    console.log(`   ⚠️  Need at least ${CONFIG.initialLp.sol + 0.1} SOL (including gas)\n`);
    return { success: false, reason: 'insufficient_sol' };
  }

  // CLWDN balance
  const authAta = await getAssociatedTokenAddress(CLWDN_MINT, authority.publicKey);
  try {
    const clwdnBalance = await conn.getTokenAccountBalance(authAta);
    const clwdnAmount = Number(clwdnBalance.value.amount) / 1e9;
    console.log(`   CLWDN: ${clwdnAmount.toLocaleString()} CLWDN\n`);

    if (clwdnAmount < CONFIG.initialLp.clwdn) {
      console.log(`   ⚠️  Need at least ${CONFIG.initialLp.clwdn.toLocaleString()} CLWDN\n`);
      return { success: false, reason: 'insufficient_clwdn' };
    }

    console.log('   ✅ Sufficient balances!\n');
  } catch (e) {
    console.log('   ❌ CLWDN token account not found\n');
    return { success: false, reason: 'no_clwdn_account' };
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 CREATE POOL:\n');

  console.log('METHOD 1: Raydium UI (Recommended)\n');
  console.log('   1. Go to: https://raydium.io/liquidity/create/');
  console.log('   2. Connect wallet');
  console.log('   3. Select WSOL / CLWDN');
  console.log(`   4. Add ${CONFIG.initialLp.sol} SOL`);
  console.log(`   5. Add ${CONFIG.initialLp.clwdn.toLocaleString()} CLWDN`);
  console.log('   6. Click "Create Pool"');
  console.log('   7. SAVE THE LP TOKEN MINT ADDRESS!\n');

  console.log('METHOD 2: CLI\n');
  console.log('   raydium create-pool \\');
  console.log('     --token-a So11111111111111111111111111111111111111112 \\');
  console.log(`     --token-b ${CLWDN_MINT.toBase58()} \\`);
  console.log(`     --amount-a ${CONFIG.initialLp.sol * LAMPORTS_PER_SOL} \\`);
  console.log(`     --amount-b ${CONFIG.initialLp.clwdn * 1e9} \\`);
  console.log('     --url devnet\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 AFTER POOL CREATION:\n');
  console.log('   1. Note the pool address');
  console.log('   2. Note the LP token mint');
  console.log('   3. KEEP the LP tokens (DON\'T BURN YET)');
  console.log('   4. Save addresses to config file\n');

  console.log('✅ THEN RUN: node progressive-lp-launch.js --start-bootstrap\n');

  return { success: true, method: 'manual' };
}

// ═══════════════════════════════════════════════════════
// PHASE 1: START BOOTSTRAP (WITH LP ALREADY RUNNING)
// ═══════════════════════════════════════════════════════

async function phase1_startBootstrap() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 1: START BOOTSTRAP (LP ALREADY LIVE)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('🎯 BOOTSTRAP PHASE:\n');
  console.log(`   Distribution: ${CONFIG.bootstrap.clwdn.toLocaleString()} CLWDN`);
  console.log(`   Fixed Rate: ${CONFIG.bootstrap.ratePerSol.toLocaleString()} CLWDN per SOL`);
  console.log(`   Target: ${CONFIG.bootstrap.targetSol.toLocaleString()} SOL\n`);

  console.log('⚡ PARALLEL OPERATIONS:\n');
  console.log('   🔵 LP Pool: LIVE and trading');
  console.log('   🟢 Bootstrap: Collecting SOL at fixed rate');
  console.log('   🟡 Arbitrage: Possible between LP and bootstrap\n');

  console.log('📊 PRICE DYNAMICS:\n');
  console.log(`   Initial LP Price: 1 SOL = ${CONFIG.initialLp.pricePerSol.toLocaleString()} CLWDN`);
  console.log(`   Bootstrap Price: 1 SOL = ${CONFIG.bootstrap.ratePerSol.toLocaleString()} CLWDN`);
  console.log('   Arbitrageurs will likely:');
  console.log('     1. Buy from bootstrap at 10K per SOL');
  console.log('     2. Sell on LP at ~40K per SOL (4x profit!)');
  console.log('     3. LP price converges toward bootstrap price\n');

  console.log('✅ THIS IS INTENTIONAL:\n');
  console.log('   → Price discovery happens naturally');
  console.log('   → Market finds equilibrium');
  console.log('   → Bootstrap gets funded faster\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📢 SHARE ON TWITTER:\n');
  console.log('   "🎉 CLAWDNATION BOOTSTRAP + LP LIVE!\\n');
  console.log('   💰 Bootstrap: 10K CLWDN per SOL (fixed)\\n');
  console.log('   📊 LP Trading: LIVE on Raydium\\n');
  console.log('   🎯 Target: 10K SOL raise\\n');
  console.log('   ⏰ Duration: Until 100M CLWDN sold"\\n\n');

  console.log('🔗 ADDRESSES:\n');
  console.log(`   Bootstrap: ${BOOTSTRAP_STATE.toBase58()}`);
  console.log('   LP Pool: [YOUR_POOL_ADDRESS]\n');

  console.log('✅ BOOTSTRAP STARTED! Monitor: --status\n');
  return true;
}

// ═══════════════════════════════════════════════════════
// CHECK STATUS
// ═══════════════════════════════════════════════════════

async function checkStatus() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  STATUS CHECK');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Bootstrap progress
  const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!stateInfo) {
    console.log('❌ Bootstrap state not found\n');
    return { complete: false };
  }

  const solRaised = stateInfo.lamports / LAMPORTS_PER_SOL;

  // Dispenser balance
  const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
  try {
    const balance = await conn.getTokenAccountBalance(dispenserAta);
    const currentBalance = Number(balance.value.amount) / 1e9;
    const distributed = Math.max(0, CONFIG.bootstrap.clwdn - currentBalance);
    const percentComplete = (distributed / CONFIG.bootstrap.clwdn) * 100;

    console.log('💰 BOOTSTRAP PROGRESS:\n');
    console.log(`   SOL Raised: ~${solRaised.toLocaleString()} SOL`);
    console.log(`   CLWDN Distributed: ${distributed.toLocaleString()} / ${CONFIG.bootstrap.clwdn.toLocaleString()}`);
    console.log(`   Progress: ${percentComplete.toFixed(1)}%\n`);

    const isComplete = percentComplete >= 99;

    if (isComplete) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ BOOTSTRAP COMPLETE! 🎉\n');
      console.log('🔥 NEXT: Add raised liquidity to pool\n');
      console.log('   Run: node progressive-lp-launch.js --add-liquidity\n');
    } else {
      console.log('⏳ Bootstrap in progress...\n');
    }

    return { complete: isComplete, solRaised, distributed, percentComplete };
  } catch (e) {
    console.log('⚠️  Error:', e.message, '\n');
    return { complete: false, solRaised };
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 2: ADD RAISED LIQUIDITY TO EXISTING POOL
// ═══════════════════════════════════════════════════════

async function phase2_addLiquidity(poolAddress) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 2: ADD RAISED LIQUIDITY TO POOL');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check bootstrap completion
  const status = await checkStatus();
  if (!status.complete) {
    console.log('⚠️  Bootstrap not complete yet\n');
    return false;
  }

  const raisedSol = status.solRaised || CONFIG.bootstrap.targetSol;
  const remainingClwdn = CONFIG.finalLp.clwdn;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 LIQUIDITY ADDITION:\n');
  console.log('   CURRENT LP:');
  console.log(`     SOL: ${CONFIG.initialLp.sol} SOL`);
  console.log(`     CLWDN: ${CONFIG.initialLp.clwdn.toLocaleString()} CLWDN\n`);
  console.log('   ADDING:');
  console.log(`     SOL: ${raisedSol.toLocaleString()} SOL (from bootstrap)`);
  console.log(`     CLWDN: ${remainingClwdn.toLocaleString()} CLWDN\n`);
  console.log('   FINAL LP:');
  console.log(`     SOL: ${(CONFIG.initialLp.sol + raisedSol).toLocaleString()} SOL`);
  console.log(`     CLWDN: ${(CONFIG.initialLp.clwdn + remainingClwdn).toLocaleString()} CLWDN\n`);

  const finalPrice = (CONFIG.initialLp.clwdn + remainingClwdn) / (CONFIG.initialLp.sol + raisedSol);
  console.log(`   New Price: 1 SOL = ${finalPrice.toLocaleString()} CLWDN\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 ADD LIQUIDITY:\n');

  if (!poolAddress) {
    console.log('❌ Pool address not provided\n');
    console.log('USAGE:');
    console.log('   node progressive-lp-launch.js --add-liquidity [POOL_ADDRESS]\n');
    return false;
  }

  console.log(`   Pool Address: ${poolAddress}\n`);

  console.log('METHOD 1: Raydium UI (Recommended)\n');
  console.log('   1. Go to: https://raydium.io/liquidity/');
  console.log(`   2. Find your pool: ${poolAddress}`);
  console.log('   3. Click "Add Liquidity"');
  console.log(`   4. Add ${raisedSol.toLocaleString()} SOL`);
  console.log(`   5. Add ${remainingClwdn.toLocaleString()} CLWDN`);
  console.log('   6. Confirm transaction');
  console.log('   7. YOU WILL RECEIVE MORE LP TOKENS\n');

  console.log('METHOD 2: CLI\n');
  console.log('   raydium add-liquidity \\');
  console.log(`     --pool ${poolAddress} \\`);
  console.log(`     --amount-a ${raisedSol * LAMPORTS_PER_SOL} \\`);
  console.log(`     --amount-b ${remainingClwdn * 1e9} \\`);
  console.log('     --url devnet\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 AFTER ADDING LIQUIDITY:\n');
  console.log('   ✓ Pool now has full liquidity');
  console.log('   ✓ You hold ALL LP tokens (initial + new)');
  console.log('   ✓ Time to BURN them!\n');

  console.log('✅ NEXT: node progressive-lp-launch.js --burn-all-lp [LP_MINT]\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// PHASE 3: BURN ALL LP TOKENS
// ═══════════════════════════════════════════════════════

async function phase3_burnAllLp(lpMint) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 3: BURN ALL LP TOKENS (LOCK FOREVER)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!lpMint) {
    console.log('❌ LP mint address required\n');
    console.log('USAGE:');
    console.log('   node progressive-lp-launch.js --burn-all-lp [LP_MINT]\n');
    return false;
  }

  console.log(`🔥 LP Mint: ${lpMint}\n`);

  // Find all LP token accounts
  console.log('🔍 FINDING YOUR LP TOKEN ACCOUNTS:\n');
  console.log('   Command:');
  console.log(`   spl-token accounts ${lpMint} --url devnet\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⚠️  CRITICAL WARNING:\n');
  console.log('   You are about to burn ALL LP tokens');
  console.log('   This will lock liquidity FOREVER');
  console.log('   NO ONE can remove liquidity (including you!)');
  console.log('   The pool will exist permanently with current liquidity\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ PRE-BURN CHECKLIST:\n');
  console.log('   [ ] Bootstrap completed (100M CLWDN distributed)');
  console.log('   [ ] Liquidity added (raised SOL + 399.6M CLWDN)');
  console.log('   [ ] Trading works on pool');
  console.log('   [ ] Price is reasonable');
  console.log('   [ ] You hold ALL LP tokens\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔥 BURN COMMANDS:\n');

  console.log('STEP 1: Find all LP token accounts\n');
  console.log(`   spl-token accounts ${lpMint} --url devnet\n`);

  console.log('STEP 2: Burn each account\n');
  console.log('   spl-token burn [LP_TOKEN_ACCOUNT_1] ALL --url devnet');
  console.log('   spl-token burn [LP_TOKEN_ACCOUNT_2] ALL --url devnet');
  console.log('   (repeat for all accounts)\n');

  console.log('STEP 3: Verify all burned\n');
  console.log(`   spl-token balance ${lpMint} --url devnet`);
  console.log('   Should show: 0\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎯 AFTER BURN:\n');
  console.log('   1. Verify all LP tokens burned');
  console.log('   2. Test trading still works');
  console.log('   3. Announce liquidity locked!');
  console.log('   4. Share pool link');
  console.log('   5. Celebrate! 🎉\n');

  console.log('📢 TWEET:\n');
  console.log('   "🔥 ALL LP TOKENS BURNED!\\n');
  console.log('   💎 Liquidity LOCKED FOREVER\\n');
  console.log('   🚫 No one can remove liquidity\\n');
  console.log('   ✅ 100% community-owned liquidity\\n');
  console.log('   🎊 CLAWDNATION fully launched!"\\n\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// SHOW COMPLETE FLOW
// ═══════════════════════════════════════════════════════

function showCompleteFlow() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         PROGRESSIVE LP LAUNCH: COMPLETE FLOW               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('DAY 0: Minimal LP + Bootstrap Start\n');
  console.log('   T+0h:     node progressive-lp-launch.js --create-minimal-lp');
  console.log('   T+0h:     Create small LP via Raydium (10 SOL + 400K CLWDN)');
  console.log('   T+0h:     Trading LIVE! 🎉');
  console.log('   T+0h:     node progressive-lp-launch.js --start-bootstrap');
  console.log('   T+0h:     Share on Twitter\n');

  console.log('DAY 0-2: Parallel Operations\n');
  console.log('   T+0-48h:  LP trading (price discovery)');
  console.log('   T+0-48h:  Bootstrap collecting SOL');
  console.log('   T+0-48h:  Arbitrage between LP and bootstrap');
  console.log('   T+0-48h:  Monitor: node progressive-lp-launch.js --status\n');

  console.log('DAY 2: Add Full Liquidity\n');
  console.log('   T+48h:    Bootstrap completes (100M CLWDN sold)');
  console.log('   T+48h:    node progressive-lp-launch.js --add-liquidity [POOL]');
  console.log('   T+48h:    Add raised SOL + 399.6M CLWDN via Raydium');
  console.log('   T+48h:    Pool now has FULL liquidity\n');

  console.log('DAY 2: Lock Liquidity Forever\n');
  console.log('   T+48h:    node progressive-lp-launch.js --burn-all-lp [LP_MINT]');
  console.log('   T+48h:    Burn ALL LP tokens');
  console.log('   T+48h:    Verify burn complete');
  console.log('   T+48h:    Announce locked liquidity! 🎉\n');

  console.log('TOKENOMICS RESULT:\n');
  console.log('   ✓ Bootstrap: 100M CLWDN (10%) → Distributed to contributors');
  console.log('   ✓ Liquidity: 400M CLWDN (40%) → LP locked forever');
  console.log('   ○ Staking: 150M CLWDN (15%) → 4yr vest');
  console.log('   ○ Team: 150M CLWDN (15%) → 6m cliff + 12m vest');
  console.log('   ○ Community: 100M CLWDN (10%) → Future');
  console.log('   ○ Treasury: 100M CLWDN (10%) → Governance\n');

  console.log('KEY DIFFERENCES FROM V2:\n');
  console.log('   ✓ Trading from Day 0 (not after bootstrap)');
  console.log('   ✓ Price discovery during bootstrap');
  console.log('   ✓ Arbitrage opportunities (intentional)');
  console.log('   ✗ Need small team SOL upfront (10 SOL)\n');
}

// ═══════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log('PROGRESSIVE LP LAUNCH: Minimal → Full\n');
    console.log('Creates minimal LP first, then adds liquidity after bootstrap\n');
    console.log('COMMANDS:\n');
    console.log('  --create-minimal-lp           Create small initial LP (10 SOL)');
    console.log('  --start-bootstrap             Start bootstrap (parallel to LP)');
    console.log('  --status                      Check bootstrap progress');
    console.log('  --add-liquidity [POOL]        Add raised liquidity to pool');
    console.log('  --burn-all-lp [MINT]          Burn all LP tokens (lock forever)');
    console.log('  --flow                        Show complete flow diagram');
    console.log('  --help                        Show this help\n');
    console.log('EXAMPLE:\n');
    console.log('  node progressive-lp-launch.js --create-minimal-lp');
    console.log('  # Create pool via Raydium UI with 10 SOL + 400K CLWDN');
    console.log('  node progressive-lp-launch.js --start-bootstrap');
    console.log('  # Wait for bootstrap...');
    console.log('  node progressive-lp-launch.js --status');
    console.log('  node progressive-lp-launch.js --add-liquidity [POOL_ADDRESS]');
    console.log('  node progressive-lp-launch.js --burn-all-lp [LP_MINT]\n');
    return;
  }

  if (args.includes('--create-minimal-lp')) {
    await phase0_createMinimalLp();
  } else if (args.includes('--start-bootstrap')) {
    await phase1_startBootstrap();
  } else if (args.includes('--status')) {
    await checkStatus();
  } else if (args.includes('--add-liquidity')) {
    const poolAddress = args[args.indexOf('--add-liquidity') + 1];
    await phase2_addLiquidity(poolAddress);
  } else if (args.includes('--burn-all-lp')) {
    const lpMint = args[args.indexOf('--burn-all-lp') + 1];
    await phase3_burnAllLp(lpMint);
  } else if (args.includes('--flow')) {
    showCompleteFlow();
  } else {
    console.log('Unknown command. Use --help for usage.\n');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  phase0_createMinimalLp,
  phase1_startBootstrap,
  checkStatus,
  phase2_addLiquidity,
  phase3_burnAllLp,
};
