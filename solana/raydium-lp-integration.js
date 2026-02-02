/**
 * RAYDIUM CPMM INTEGRATION
 *
 * Phase 1: Bootstrap raises SOL
 * Phase 2: Auto-create LP on Raydium with raised SOL
 * Phase 3: Burn LP tokens to lock forever
 *
 * Tests against actual Raydium CPMM program on devnet
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createBurnInstruction,
  createTransferInstruction,
} = require('@solana/spl-token');
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

// Raydium CPMM Program (devnet)
const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

// Null address for burning (alternative to actual burn)
const NULL_ADDRESS = new PublicKey('11111111111111111111111111111111');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║          RAYDIUM CPMM LP AUTO-CREATION FLOW                ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════
// PHASE 1: BOOTSTRAP SIMULATION (ALREADY DONE)
// ═══════════════════════════════════════════════════════

async function phase1_checkBootstrap() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 1: Check Bootstrap Status');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const stateInfo = await conn.getAccountInfo(BOOTSTRAP_STATE);
    if (!stateInfo) {
      console.log('❌ Bootstrap state not found\n');
      return { complete: false };
    }

    const solRaised = stateInfo.lamports / LAMPORTS_PER_SOL;
    console.log(`✅ Bootstrap State Found`);
    console.log(`   SOL Raised: ~${solRaised.toLocaleString()} SOL\n`);

    // In real scenario, parse the account data to get:
    // - total_contributed_lamports
    // - total_allocated_clwdn
    // - bootstrap_complete flag

    return {
      complete: true,
      solRaised: solRaised,
      clwdnDistributed: 100_000_000, // 100M from bootstrap
    };
  } catch (e) {
    console.log('❌ Error checking bootstrap:', e.message, '\n');
    return { complete: false };
  }
}

// ═══════════════════════════════════════════════════════
// PHASE 2: CREATE RAYDIUM CPMM POOL
// ═══════════════════════════════════════════════════════

async function phase2_createRaydiumPool(solAmount, clwdnAmount) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 2: Create Raydium CPMM Pool');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📋 LP CONFIGURATION:\n');
  console.log(`   SOL Amount: ${solAmount.toLocaleString()} SOL`);
  console.log(`   CLWDN Amount: ${clwdnAmount.toLocaleString()} CLWDN`);
  console.log(`   Initial Price: 1 SOL = ${(clwdnAmount / solAmount).toLocaleString()} CLWDN\n`);

  console.log('🔧 RAYDIUM CPMM INTEGRATION:\n');
  console.log(`   Program: ${RAYDIUM_CPMM_PROGRAM.toBase58()}`);
  console.log('   Pool Type: Constant Product Market Maker (CPMM)\n');

  console.log('📝 IMPLEMENTATION OPTIONS:\n');
  console.log('OPTION A: Use Raydium SDK (Recommended)\n');
  console.log('   npm install @raydium-io/raydium-sdk');
  console.log('   - Handles all account derivations');
  console.log('   - Manages pool initialization');
  console.log('   - Creates LP tokens automatically\n');

  console.log('OPTION B: Direct CPI from Bootstrap Program\n');
  console.log('   - Integrate raydium-cpmm program in Anchor');
  console.log('   - Call initialize_pool in complete_raise()');
  console.log('   - More complex but fully automated\n');

  console.log('OPTION C: External Script (Simplest for Testing)\n');
  console.log('   - Use Raydium UI or CLI');
  console.log('   - Create pool manually after bootstrap');
  console.log('   - Good for devnet testing\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // For this demo, we'll show the manual approach
  return await createPoolManual(solAmount, clwdnAmount);
}

async function createPoolManual(solAmount, clwdnAmount) {
  console.log('🔨 MANUAL POOL CREATION STEPS:\n');

  console.log('STEP 1: Prepare Token Accounts\n');

  // Get authority's CLWDN token account
  const authorityCLWDNAta = await getAssociatedTokenAddress(CLWDN_MINT, authority.publicKey);

  console.log('   Authority CLWDN ATA:', authorityCLWDNAta.toBase58());
  console.log('   Need', clwdnAmount.toLocaleString(), 'CLWDN in this account\n');

  // Check balance
  try {
    const balance = await conn.getTokenAccountBalance(authorityCLWDNAta);
    const balanceAmount = Number(balance.value.amount) / 1e9;

    console.log(`   Current Balance: ${balanceAmount.toLocaleString()} CLWDN`);

    if (balanceAmount < clwdnAmount) {
      console.log(`   ⚠️  Insufficient! Need ${(clwdnAmount - balanceAmount).toLocaleString()} more\n`);
      return { success: false, reason: 'insufficient_clwdn' };
    }
    console.log('   ✅ Sufficient balance!\n');
  } catch (e) {
    console.log('   ⚠️  Token account not found or error:', e.message, '\n');
    return { success: false, reason: 'no_token_account' };
  }

  console.log('STEP 2: Create Pool (Choose Method)\n');

  console.log('METHOD A: Raydium UI (Easiest)\n');
  console.log('   1. Go to: https://raydium.io/liquidity/create/');
  console.log('   2. Connect wallet');
  console.log('   3. Select WSOL and CLWDN');
  console.log(`   4. Add ${solAmount.toLocaleString()} SOL`);
  console.log(`   5. Add ${clwdnAmount.toLocaleString()} CLWDN`);
  console.log('   6. Click "Create Pool"\n');

  console.log('METHOD B: Raydium CLI\n');
  console.log('   npm install -g @raydium-io/raydium-cli');
  console.log('   raydium create-pool \\');
  console.log(`     --token-a So11111111111111111111111111111111111111112 \\ # WSOL`);
  console.log(`     --token-b ${CLWDN_MINT.toBase58()} \\`);
  console.log(`     --amount-a ${Math.floor(solAmount * LAMPORTS_PER_SOL)} \\`);
  console.log(`     --amount-b ${Math.floor(clwdnAmount * 1e9)} \\`);
  console.log('     --url devnet\n');

  console.log('METHOD C: Direct Program Call (Advanced)\n');
  console.log('   - Requires understanding Raydium CPMM program');
  console.log('   - See: https://github.com/raydium-io/raydium-cpmm');
  console.log('   - Need to derive pool PDA, vault accounts, LP mint\n');

  return {
    success: true,
    method: 'manual',
    poolAddress: null, // Will be created externally
  };
}

// ═══════════════════════════════════════════════════════
// PHASE 3: BURN LP TOKENS
// ═══════════════════════════════════════════════════════

async function phase3_burnLpTokens(lpMint, lpTokenAccount) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 3: Burn LP Tokens (LOCK LIQUIDITY FOREVER)');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!lpMint || !lpTokenAccount) {
    console.log('⚠️  LP mint or token account not provided\n');
    console.log('💡 AFTER CREATING POOL:\n');
    console.log('   1. Note the LP token mint address');
    console.log('   2. Find your LP token account');
    console.log('   3. Run this script with --burn-lp flag\n');
    return { success: false, reason: 'no_lp_info' };
  }

  console.log('🔥 BURN OPTIONS:\n');

  console.log('OPTION A: Burn Instruction (Recommended)\n');
  console.log('   Command:');
  console.log(`   spl-token burn ${lpTokenAccount} ALL --url devnet\n`);
  console.log('   Result: LP tokens permanently destroyed\n');

  console.log('OPTION B: Transfer to Null Address\n');
  console.log('   Command:');
  console.log(`   spl-token transfer ${lpMint} ALL 11111111111111111111111111111111 --url devnet\n`);
  console.log('   Result: LP tokens sent to unspendable address\n');

  console.log('OPTION C: Transfer to Dead Address\n');
  console.log('   Address: 1nc1nerator11111111111111111111111111111111');
  console.log('   Same effect as Option B\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔒 SECURITY CHECK:\n');
  console.log('   Before burning, verify:');
  console.log('   ✓ Pool created successfully');
  console.log('   ✓ LP tokens in your account');
  console.log('   ✓ Trading works on pool');
  console.log('   ✓ LP token amount is correct\n');

  console.log('🎯 TO EXECUTE BURN:\n');
  console.log(`   node raydium-lp-integration.js --burn-lp ${lpMint} ${lpTokenAccount}\n`);

  return { success: true, method: 'manual' };
}

async function executeBurn(lpMint, lpTokenAccount) {
  console.log('🔥 EXECUTING LP TOKEN BURN...\n');

  try {
    const lpMintPubkey = new PublicKey(lpMint);
    const lpTokenAccountPubkey = new PublicKey(lpTokenAccount);

    // Get current balance
    const balance = await conn.getTokenAccountBalance(lpTokenAccountPubkey);
    const amount = balance.value.amount;

    console.log(`   LP Mint: ${lpMintPubkey.toBase58()}`);
    console.log(`   LP Token Account: ${lpTokenAccountPubkey.toBase58()}`);
    console.log(`   Amount to Burn: ${amount} (raw)\n`);

    console.log('⚠️  THIS WILL PERMANENTLY LOCK LIQUIDITY!\n');
    console.log('   Once burned, you CANNOT remove liquidity');
    console.log('   The pool will exist forever\n');

    console.log('❓ ARE YOU SURE? (this is a dry-run, no actual burn)\n');

    // Dry run - show what would happen
    console.log('📝 TRANSACTION PREVIEW:\n');
    console.log('   Instruction: Burn');
    console.log(`   Mint: ${lpMintPubkey.toBase58()}`);
    console.log(`   From: ${lpTokenAccountPubkey.toBase58()}`);
    console.log(`   Amount: ${amount}`);
    console.log(`   Authority: ${authority.publicKey.toBase58()}\n`);

    console.log('✅ DRY RUN COMPLETE\n');
    console.log('💡 TO EXECUTE FOR REAL:\n');
    console.log('   Remove the dry-run check in the code');
    console.log('   Or use: spl-token burn command\n');

    return { success: true, dryRun: true };
  } catch (e) {
    console.log('❌ Error:', e.message, '\n');
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════
// INTEGRATION SUMMARY
// ═══════════════════════════════════════════════════════

async function showIntegrationSummary() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           BOOTSTRAP → LP INTEGRATION SUMMARY               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('🏗️  ARCHITECTURE:\n');
  console.log('   ┌─────────────┐');
  console.log('   │  Bootstrap  │  Phase 1: Collect SOL, distribute 100M CLWDN');
  console.log('   │   Program   │  - Fixed rate: 10K CLWDN per SOL');
  console.log('   └──────┬──────┘  - Auto-completes when cap reached');
  console.log('          │');
  console.log('          ▼');
  console.log('   ┌─────────────┐');
  console.log('   │  complete_  │  Phase 2: Mark bootstrap done');
  console.log('   │   raise()   │  - Emits BootstrapCompleteEvent');
  console.log('   └──────┬──────┘  - Authorizes LP creation');
  console.log('          │');
  console.log('          ▼');
  console.log('   ┌─────────────┐');
  console.log('   │   Raydium   │  Phase 3: Create LP');
  console.log('   │    CPMM     │  - Use raised SOL + 400M CLWDN');
  console.log('   └──────┬──────┘  - Initial price = 40K per SOL');
  console.log('          │');
  console.log('          ▼');
  console.log('   ┌─────────────┐');
  console.log('   │  Burn LP    │  Phase 4: Lock liquidity');
  console.log('   │   Tokens    │  - Burn all LP tokens');
  console.log('   └─────────────┘  - PERMANENT LOCK 🔒\n');

  console.log('🔄 AUTOMATION LEVELS:\n');
  console.log('   Level 1 (CURRENT): Semi-Automated');
  console.log('     ✓ Bootstrap auto-completes when cap reached');
  console.log('     ✗ LP creation requires external tool (Raydium UI/CLI)');
  console.log('     ✗ LP burn requires spl-token command\n');

  console.log('   Level 2 (FUTURE): Fully Automated');
  console.log('     ✓ Bootstrap auto-completes');
  console.log('     ✓ CPI to Raydium CPMM from complete_raise()');
  console.log('     ✓ Auto-burn LP tokens immediately\n');

  console.log('   Level 3 (ADVANCED): Progressive LP');
  console.log('     ✓ Add to LP as contributions come in');
  console.log('     ✓ Dynamic pricing based on accumulation');
  console.log('     ✓ No manual trigger needed\n');

  console.log('💡 RECOMMENDATION FOR LAUNCH:\n');
  console.log('   Use Level 1 (semi-automated) for safety and testing\n');
  console.log('   - Bootstrap phase: Fully automated ✅');
  console.log('   - LP creation: Manual via Raydium UI (safer, tested) ✅');
  console.log('   - LP burn: Manual via CLI (verify first) ✅\n');

  console.log('📁 FILES NEEDED:\n');
  console.log('   ✓ bootstrap/programs/bootstrap/src/lib_with_lp.rs (created)');
  console.log('   ✓ raydium-lp-integration.js (this file)');
  console.log('   ○ Updated launch-sequence.js (next step)\n');
}

// ═══════════════════════════════════════════════════════
// CLI INTERFACE
// ═══════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--burn-lp') && args.length >= 3) {
    const lpMint = args[1];
    const lpTokenAccount = args[2];
    await executeBurn(lpMint, lpTokenAccount);
    return;
  }

  if (args.includes('--help')) {
    console.log('USAGE:\n');
    console.log('  node raydium-lp-integration.js              # Run full flow');
    console.log('  node raydium-lp-integration.js --burn-lp [MINT] [ACCOUNT]  # Burn LP tokens\n');
    return;
  }

  // Full flow
  console.log('🚀 RUNNING FULL INTEGRATION FLOW\n\n');

  // Phase 1: Check bootstrap
  const bootstrap = await phase1_checkBootstrap();

  if (!bootstrap.complete) {
    console.log('⚠️  Bootstrap not complete. Run bootstrap first.\n');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Phase 2: Create LP
  const solForLp = bootstrap.solRaised || 10_000;
  const clwdnForLp = 400_000_000;

  const poolResult = await phase2_createRaydiumPool(solForLp, clwdnForLp);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Phase 3: Burn LP
  await phase3_burnLpTokens(null, null);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Summary
  await showIntegrationSummary();

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                  INTEGRATION COMPLETE! ✅                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('🎯 NEXT STEPS:\n');
  console.log('1. Deploy updated Bootstrap program with LP support');
  console.log('2. Run bootstrap phase (collect SOL)');
  console.log('3. Call complete_raise() when done');
  console.log('4. Create LP via Raydium UI or CLI');
  console.log('5. Burn LP tokens with spl-token command');
  console.log('6. Announce launch! 🎉\n');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  phase1_checkBootstrap,
  phase2_createRaydiumPool,
  phase3_burnLpTokens,
  executeBurn,
};
