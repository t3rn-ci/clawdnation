/**
 * CLAWDNATION LAUNCH SEQUENCE V2
 *
 * TWO-PHASE AUTO-LP SYSTEM:
 *
 * Phase 1 (Day 0): Bootstrap
 *   - Contributions open
 *   - Fixed rate: 10K CLWDN per SOL
 *   - Auto-completes when 100M CLWDN distributed
 *
 * Phase 2 (Day X): Complete Raise → Auto-LP
 *   - complete_raise() marks bootstrap done
 *   - Creates Raydium LP with raised SOL + 400M CLWDN
 *   - Burns LP tokens (liquidity locked forever)
 *
 * USAGE:
 *   node launch-sequence-v2.js --start-bootstrap    # Start phase 1
 *   node launch-sequence-v2.js --status              # Check progress
 *   node launch-sequence-v2.js --complete-raise      # Finish & create LP
 *   node launch-sequence-v2.js --burn-lp             # Lock liquidity forever
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

const CONFIG = {
  bootstrap: {
    clwdnAmount: 100_000_000, // 100M CLWDN
    rate: 10_000, // CLWDN per SOL
    targetSol: 10_000, // Expected SOL raise
  },
  lp: {
    clwdnAmount: 400_000_000, // 400M CLWDN
    rate: 40_000, // CLWDN per SOL (4x bootstrap)
  },
};

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║      CLAWDNATION LAUNCH V2: AUTO-LP INTEGRATION            ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════
// PHASE 1: START BOOTSTRAP
// ═══════════════════════════════════════════════════════

async function startBootstrap() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 1: START BOOTSTRAP');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📋 BOOTSTRAP PHASE:\n');
  console.log(`   Distribution: ${CONFIG.bootstrap.clwdnAmount.toLocaleString()} CLWDN (10%)`);
  console.log(`   Fixed Rate: ${CONFIG.bootstrap.rate.toLocaleString()} CLWDN per SOL`);
  console.log(`   Target: ${CONFIG.bootstrap.targetSol.toLocaleString()} SOL`);
  console.log(`   Duration: Until ${CONFIG.bootstrap.clwdnAmount.toLocaleString()} CLWDN sold\n`);

  // Check bootstrap state
  const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!stateInfo) {
    console.log('❌ Bootstrap state not initialized\n');
    console.log('💡 Initialize first:');
    console.log('   cd bootstrap');
    console.log('   anchor build');
    console.log('   anchor deploy');
    console.log('   anchor run initialize\n');
    return false;
  }

  console.log('✅ Bootstrap program ready\n');

  // Check dispenser balance
  const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
  try {
    const balance = await conn.getTokenAccountBalance(dispenserAta);
    const balanceAmount = Number(balance.value.amount) / 1e9;

    console.log('💰 DISPENSER STATUS:\n');
    console.log(`   Balance: ${balanceAmount.toLocaleString()} CLWDN`);
    console.log(`   Needed for Bootstrap: ${CONFIG.bootstrap.clwdnAmount.toLocaleString()} CLWDN`);

    if (balanceAmount < CONFIG.bootstrap.clwdnAmount) {
      console.log(`   ⚠️  Need ${(CONFIG.bootstrap.clwdnAmount - balanceAmount).toLocaleString()} more CLWDN\n`);
    } else {
      console.log('   ✅ Sufficient for bootstrap phase!\n');
    }
  } catch (e) {
    console.log('⚠️  Could not check dispenser balance:', e.message, '\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎯 WHAT HAPPENS NOW:\n');
  console.log('   1. Users send SOL to bootstrap address');
  console.log('   2. They receive CLWDN at fixed rate (10K per SOL)');
  console.log('   3. SOL accumulates in treasury');
  console.log('   4. When 100M CLWDN sold → bootstrap auto-completes');
  console.log('   5. Run --complete-raise to create LP\n');

  console.log('📢 SHARE ON TWITTER:\n');
  console.log(`   "🎉 CLAWDNATION BOOTSTRAP IS LIVE!`);
  console.log(`    💰 Rate: ${CONFIG.bootstrap.rate.toLocaleString()} CLWDN per SOL`);
  console.log(`    🎯 Target: ${CONFIG.bootstrap.targetSol.toLocaleString()} SOL`);
  console.log(`    📍 Address: ${BOOTSTRAP_STATE.toBase58()}"`);
  console.log('\n');

  console.log('🔗 CONTRIBUTION ADDRESS:\n');
  console.log(`   ${BOOTSTRAP_STATE.toBase58()}\n`);

  console.log('✅ BOOTSTRAP PHASE LIVE! Monitor with: --status\n');
  return true;
}

// ═══════════════════════════════════════════════════════
// CHECK STATUS
// ═══════════════════════════════════════════════════════

async function checkStatus() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  STATUS CHECK');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check bootstrap state
  const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!stateInfo) {
    console.log('❌ Bootstrap state not found\n');
    return { complete: false };
  }

  const solRaised = stateInfo.lamports / LAMPORTS_PER_SOL;

  console.log('💰 BOOTSTRAP PROGRESS:\n');
  console.log(`   SOL Raised: ~${solRaised.toLocaleString()} SOL`);

  // Check dispenser balance to calculate distributed amount
  const dispenserAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true);
  try {
    const balance = await conn.getTokenAccountBalance(dispenserAta);
    const currentBalance = Number(balance.value.amount) / 1e9;

    // Assuming started with enough for bootstrap + LP
    const distributed = Math.max(0, CONFIG.bootstrap.clwdnAmount - currentBalance);
    const percentComplete = (distributed / CONFIG.bootstrap.clwdnAmount) * 100;

    console.log(`   CLWDN Distributed: ${distributed.toLocaleString()} / ${CONFIG.bootstrap.clwdnAmount.toLocaleString()}`);
    console.log(`   Progress: ${percentComplete.toFixed(1)}%\n`);

    const isComplete = percentComplete >= 99;

    if (isComplete) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ BOOTSTRAP COMPLETE! 🎉\n');
      console.log('🔥 NEXT STEP: Create LP with raised funds\n');
      console.log('   Run: node launch-sequence-v2.js --complete-raise\n');
    } else {
      console.log('⏳ Bootstrap in progress...\n');
      console.log(`   Remaining: ${(CONFIG.bootstrap.clwdnAmount - distributed).toLocaleString()} CLWDN\n`);
    }

    return {
      complete: isComplete,
      solRaised,
      distributed,
      percentComplete,
    };
  } catch (e) {
    console.log('⚠️  Error checking dispenser:', e.message, '\n');
    return { complete: false, solRaised };
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 2: COMPLETE RAISE & CREATE LP
// ═══════════════════════════════════════════════════════

async function completeRaise() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 2: COMPLETE RAISE & CREATE LP');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check if bootstrap is complete
  const status = await checkStatus();

  if (!status.complete) {
    console.log('⚠️  Bootstrap not complete yet\n');
    console.log(`   Progress: ${status.percentComplete?.toFixed(1) || 0}%`);
    console.log('   Wait until 100M CLWDN distributed\n');
    return false;
  }

  const solForLp = status.solRaised || CONFIG.bootstrap.targetSol;
  const clwdnForLp = CONFIG.lp.clwdnAmount;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 LP CONFIGURATION:\n');
  console.log(`   SOL from Bootstrap: ${solForLp.toLocaleString()} SOL`);
  console.log(`   CLWDN for LP: ${clwdnForLp.toLocaleString()} CLWDN (40%)`);
  console.log(`   Initial Price: 1 SOL = ${(clwdnForLp / solForLp).toLocaleString()} CLWDN`);
  console.log(`   Same as bootstrap rate: ${CONFIG.bootstrap.rate.toLocaleString()} ✅\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 STEP 1: Call complete_raise() on Bootstrap Program\n');
  console.log('   This marks the bootstrap as officially complete');
  console.log('   and emits BootstrapCompleteEvent\n');

  console.log('   Command:');
  console.log('   cd bootstrap');
  console.log('   anchor run complete-raise\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 STEP 2: Create Raydium CPMM Pool\n');

  console.log('   OPTION A: Raydium UI (Recommended)\n');
  console.log('     1. Go to: https://raydium.io/liquidity/create/');
  console.log('     2. Connect wallet');
  console.log('     3. Select WSOL and CLWDN');
  console.log(`     4. Add ${solForLp.toLocaleString()} SOL`);
  console.log(`     5. Add ${clwdnForLp.toLocaleString()} CLWDN`);
  console.log('     6. Create pool\n');

  console.log('   OPTION B: Use Raydium Integration Script\n');
  console.log('     node raydium-lp-integration.js\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 STEP 3: Note LP Token Address\n');
  console.log('   After pool creation, you will receive LP tokens');
  console.log('   Save the LP token mint address and your token account\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ AFTER LP CREATED:\n');
  console.log('   Run: node launch-sequence-v2.js --burn-lp [LP_MINT] [LP_ACCOUNT]\n');

  return true;
}

// ═══════════════════════════════════════════════════════
// PHASE 3: BURN LP TOKENS
// ═══════════════════════════════════════════════════════

async function burnLpTokens(lpMint, lpAccount) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 3: BURN LP TOKENS (LOCK LIQUIDITY FOREVER)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!lpMint || !lpAccount) {
    console.log('❌ Missing LP token info\n');
    console.log('USAGE:');
    console.log('   node launch-sequence-v2.js --burn-lp [LP_MINT] [LP_ACCOUNT]\n');
    console.log('EXAMPLE:');
    console.log('   node launch-sequence-v2.js --burn-lp \\');
    console.log('     8aHXuC6HjPNQYiBxNhqHD2CN5RxvcqRu8hvKhWHF6He \\');
    console.log('     9aHXuC6HjPNQYiBxNhqHD2CN5RxvcqRu8hvKhWHF6He\n');
    return false;
  }

  console.log('🔥 LP TOKEN BURN CONFIGURATION:\n');
  console.log(`   LP Mint: ${lpMint}`);
  console.log(`   LP Account: ${lpAccount}\n`);

  try {
    // Get balance
    const lpAccountPubkey = new PublicKey(lpAccount);
    const balance = await conn.getTokenAccountBalance(lpAccountPubkey);
    const amount = balance.value.amount;
    const decimals = balance.value.decimals;
    const uiAmount = balance.value.uiAmount;

    console.log(`   Balance: ${uiAmount} LP tokens (${amount} raw)\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  CRITICAL WARNING:\n');
    console.log('   Burning LP tokens PERMANENTLY LOCKS liquidity');
    console.log('   You will NOT be able to:');
    console.log('     ✗ Remove liquidity');
    console.log('     ✗ Adjust the pool');
    console.log('     ✗ Recover the tokens');
    console.log('   The pool will exist FOREVER with current liquidity\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ PRE-BURN CHECKLIST:\n');
    console.log('   [ ] Pool created successfully');
    console.log('   [ ] Trading works on the pool');
    console.log('   [ ] Price is correct');
    console.log('   [ ] Liquidity amounts are correct\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔥 BURN METHODS:\n');

    console.log('METHOD 1: SPL Token Burn (Recommended)\n');
    console.log(`   spl-token burn ${lpAccount} ALL --url devnet\n`);

    console.log('METHOD 2: Transfer to Null Address\n');
    console.log(`   spl-token transfer ${lpMint} ALL 11111111111111111111111111111111 \\`);
    console.log('     --url devnet --allow-unfunded-recipient\n');

    console.log('METHOD 3: Via Bootstrap Program\n');
    console.log('   cd bootstrap');
    console.log('   anchor run burn-lp-tokens\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎯 AFTER BURN:\n');
    console.log('   1. Verify: spl-token balance ' + lpMint + ' --url devnet');
    console.log('   2. Should show 0 balance');
    console.log('   3. Announce liquidity is locked!');
    console.log('   4. Tweet: "💎 Liquidity LOCKED FOREVER! LP tokens burned 🔥"\n');

    return true;
  } catch (e) {
    console.log('❌ Error:', e.message, '\n');
    return false;
  }
}

// ═══════════════════════════════════════════════════════
// SHOW FULL TIMELINE
// ═══════════════════════════════════════════════════════

function showTimeline() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              COMPLETE LAUNCH TIMELINE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('DAY 0: Bootstrap Phase\n');
  console.log('   T+0min:   node launch-sequence-v2.js --start-bootstrap');
  console.log('   T+0min:   Share on Twitter/Discord');
  console.log('   T+0-48h:  Users contribute SOL');
  console.log('   T+0-48h:  Dispenser auto-distributes CLWDN');
  console.log('   T+48h:    100M CLWDN sold → Bootstrap complete!\n');

  console.log('DAY 2: LP Creation Phase\n');
  console.log('   T+48h:    node launch-sequence-v2.js --complete-raise');
  console.log('   T+48h:    Create Raydium pool (UI or CLI)');
  console.log('   T+48h:    Note LP token addresses\n');

  console.log('DAY 2: LP Lock Phase\n');
  console.log('   T+48h:    Verify pool works correctly');
  console.log('   T+48h:    node launch-sequence-v2.js --burn-lp [MINT] [ACCOUNT]');
  console.log('   T+48h:    Execute burn command');
  console.log('   T+48h:    Verify burn successful\n');

  console.log('DAY 2: LAUNCH! 🎉\n');
  console.log('   T+48h:    Announce on Twitter');
  console.log('   T+48h:    Share pool link');
  console.log('   T+48h:    Celebrate locked liquidity');
  console.log('   T+48h:    Trading is LIVE!\n');

  console.log('TOKENOMICS:\n');
  console.log('   ✓ Bootstrap: 100M CLWDN (10%) → Distributed');
  console.log('   ✓ Liquidity: 400M CLWDN (40%) → LP locked forever');
  console.log('   ○ Staking: 150M CLWDN (15%) → 4yr vest');
  console.log('   ○ Team: 150M CLWDN (15%) → 6m cliff + 12m vest');
  console.log('   ○ Community: 100M CLWDN (10%) → Future airdrops');
  console.log('   ○ Treasury: 100M CLWDN (10%) → Operations\n');
}

// ═══════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log('CLAWDNATION LAUNCH SEQUENCE V2\n');
    console.log('Two-phase bootstrap with auto-LP creation\n');
    console.log('COMMANDS:\n');
    console.log('  --start-bootstrap     Start bootstrap phase (10% distribution)');
    console.log('  --status              Check bootstrap progress');
    console.log('  --complete-raise      Complete raise & prepare LP creation');
    console.log('  --burn-lp [MINT] [ACC] Burn LP tokens to lock liquidity');
    console.log('  --timeline            Show complete launch timeline');
    console.log('  --help                Show this help\n');
    console.log('EXAMPLE FLOW:\n');
    console.log('  node launch-sequence-v2.js --start-bootstrap');
    console.log('  # Wait for bootstrap to complete...');
    console.log('  node launch-sequence-v2.js --status');
    console.log('  node launch-sequence-v2.js --complete-raise');
    console.log('  # Create pool via Raydium UI...');
    console.log('  node launch-sequence-v2.js --burn-lp [MINT] [ACCOUNT]\n');
    return;
  }

  if (args.includes('--start-bootstrap')) {
    await startBootstrap();
  } else if (args.includes('--status')) {
    await checkStatus();
  } else if (args.includes('--complete-raise')) {
    await completeRaise();
  } else if (args.includes('--burn-lp')) {
    const lpMint = args[args.indexOf('--burn-lp') + 1];
    const lpAccount = args[args.indexOf('--burn-lp') + 2];
    await burnLpTokens(lpMint, lpAccount);
  } else if (args.includes('--timeline')) {
    showTimeline();
  } else {
    console.log('Unknown command. Use --help for usage.\n');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { startBootstrap, checkStatus, completeRaise, burnLpTokens };
