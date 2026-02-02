/**
 * BOOTSTRAP → LP FLOW (SECURE)
 *
 * Phase 1: Bootstrap (Collect SOL)
 * Phase 2: Create LP with raised SOL + 400M CLWDN
 * Phase 3: BURN LP tokens (lock forever)
 *
 * LAUNCH READY IN 30 MINUTES!
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');

console.log('🚀 BOOTSTRAP → LP FLOW\n');

// ═══════════════════════════════════════════════════════
// OPTION 1: BOOTSTRAP FIRST, LP AFTER (RECOMMENDED)
// ═══════════════════════════════════════════════════════

async function option1_bootstrapFirst() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OPTION 1: Bootstrap First → LP After (SECURE)');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📋 FLOW:\n');
  console.log('1️⃣  BOOTSTRAP PHASE (10% = 100M CLWDN)');
  console.log('   - Open bootstrap for contributions');
  console.log('   - Fixed rate: 10,000 CLWDN per SOL');
  console.log('   - Target: 10,000 SOL raised');
  console.log('   - Duration: Until 100M CLWDN sold');
  console.log('   - SOL → Treasury wallet');
  console.log('   - CLWDN → Distributed to contributors\n');

  console.log('2️⃣  CREATE LIQUIDITY POOL (40% = 400M CLWDN)');
  console.log('   - Wait for bootstrap to complete');
  console.log('   - Take ALL SOL raised (e.g., 10,000 SOL)');
  console.log('   - Pair with 400M CLWDN');
  console.log('   - Create Raydium CPMM pool');
  console.log('   - Initial price = bootstrap rate\n');

  console.log('3️⃣  LOCK LIQUIDITY (BURN LP TOKENS)');
  console.log('   - LP tokens sent to burn address');
  console.log('   - OR: Send to 0x000...000 (null address)');
  console.log('   - Liquidity PERMANENTLY LOCKED 🔒');
  console.log('   - Cannot be removed by anyone\n');

  console.log('✅ BENEFITS:');
  console.log('   ✓ Simple & secure');
  console.log('   ✓ LP funded by bootstrap (no team SOL needed)');
  console.log('   ✓ Price stability (starts at bootstrap rate)');
  console.log('   ✓ Liquidity LOCKED forever (anti-rug)');
  console.log('   ✓ Fair launch (no pre-liquidity)\n');

  console.log('⚠️  CONSIDERATIONS:');
  console.log('   • NO trading until LP created');
  console.log('   • Bootstrap must complete first');
  console.log('   • Time gap between bootstrap end and LP creation\n');

  console.log('📊 EXAMPLE:');
  console.log('   Bootstrap raises: 10,000 SOL');
  console.log('   Bootstrap sells: 100,000,000 CLWDN');
  console.log('   LP creation: 10,000 SOL + 400,000,000 CLWDN');
  console.log('   Initial price: 1 SOL = 40,000 CLWDN (same as bootstrap)');
  console.log('   LP tokens: BURNED 🔥\n');
}

// ═══════════════════════════════════════════════════════
// OPTION 2: SMALL INITIAL LP, BOOTSTRAP, FULL LP AFTER
// ═══════════════════════════════════════════════════════

async function option2_smallLpFirst() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OPTION 2: Small Initial LP → Bootstrap → Full LP');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📋 FLOW:\n');
  console.log('1️⃣  CREATE SMALL INITIAL LP');
  console.log('   - 50M CLWDN + 10 SOL (from team)');
  console.log('   - Enables immediate trading');
  console.log('   - Price discovery starts\n');

  console.log('2️⃣  RUN BOOTSTRAP IN PARALLEL');
  console.log('   - Bootstrap: 100M CLWDN for SOL');
  console.log('   - Fixed rate OR market rate');
  console.log('   - Collect SOL\n');

  console.log('3️⃣  ADD TO LP AFTER BOOTSTRAP');
  console.log('   - Add remaining 350M CLWDN');
  console.log('   - Add bootstrap SOL raised');
  console.log('   - Burn ALL LP tokens\n');

  console.log('✅ BENEFITS:');
  console.log('   ✓ Trading enabled from day 1');
  console.log('   ✓ Price discovery during bootstrap\n');

  console.log('❌ PROBLEMS:');
  console.log('   ✗ Need team SOL upfront (10 SOL)');
  console.log('   ✗ Price can deviate from fixed bootstrap rate');
  console.log('   ✗ Arbitrage opportunities');
  console.log('   ✗ More complex\n');
}

// ═══════════════════════════════════════════════════════
// OPTION 3: FULL LP LOCKED, BOOTSTRAP PARALLEL
// ═══════════════════════════════════════════════════════

async function option3_fullLpLocked() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OPTION 3: Full LP Locked → Bootstrap Parallel');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📋 FLOW:\n');
  console.log('1️⃣  CREATE FULL LP IMMEDIATELY');
  console.log('   - 400M CLWDN + X SOL (team provides)');
  console.log('   - LP tokens → Governance/Timelock');
  console.log('   - Trading enabled immediately\n');

  console.log('2️⃣  RUN BOOTSTRAP IN PARALLEL');
  console.log('   - 100M CLWDN distributed separately');
  console.log('   - SOL raised → Treasury\n');

  console.log('3️⃣  UNLOCK LP AFTER BOOTSTRAP');
  console.log('   - Option A: Keep locked forever');
  console.log('   - Option B: Timelock (6 months)');
  console.log('   - Option C: Burn LP tokens\n');

  console.log('✅ BENEFITS:');
  console.log('   ✓ Full liquidity from start');
  console.log('   ✓ Parallel bootstrap + trading\n');

  console.log('❌ PROBLEMS:');
  console.log('   ✗ Need LARGE team SOL upfront (e.g., 100+ SOL)');
  console.log('   ✗ Risk if LP unlocks (not truly locked)');
  console.log('   ✗ Complex governance setup\n');
}

// ═══════════════════════════════════════════════════════
// RECOMMENDATION
// ═══════════════════════════════════════════════════════

function showRecommendation() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   RECOMMENDATION                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('🏆 USE OPTION 1: Bootstrap First → LP After\n');

  console.log('WHY:');
  console.log('  ✓ Most secure (LP tokens burned)');
  console.log('  ✓ No team SOL needed (bootstrap funds LP)');
  console.log('  ✓ Simple to implement (30 min launch!)');
  console.log('  ✓ Fair (everyone gets bootstrap rate)');
  console.log('  ✓ Standard practice for fair launches\n');

  console.log('📋 LAUNCH SEQUENCE:\n');
  console.log('1. Open Bootstrap Program');
  console.log('   - Rate: 10,000 CLWDN per SOL');
  console.log('   - Target: 10,000 SOL');
  console.log('   - Auto-distribute via Dispenser\n');

  console.log('2. Monitor Bootstrap');
  console.log('   - Track SOL raised');
  console.log('   - Track CLWDN distributed');
  console.log('   - Wait for completion (100M sold)\n');

  console.log('3. Close Bootstrap');
  console.log('   - Total SOL raised: X SOL');
  console.log('   - Total CLWDN sold: 100M\n');

  console.log('4. Create LP');
  console.log('   - Pair: X SOL + 400M CLWDN');
  console.log('   - Platform: Raydium CPMM');
  console.log('   - Initial price: Same as bootstrap\n');

  console.log('5. Burn LP Tokens');
  console.log('   - Send to: 11111111111111111111111111111111');
  console.log('   - OR: Burn instruction');
  console.log('   - Liquidity LOCKED FOREVER 🔒\n');

  console.log('⏱️  TIMELINE:');
  console.log('   T+0:     Launch bootstrap');
  console.log('   T+1day:  Bootstrap completes');
  console.log('   T+1day:  Create LP + burn tokens');
  console.log('   T+1day:  Trading begins!\n');
}

// ═══════════════════════════════════════════════════════
// LP TOKEN BURNING OPTIONS
// ═══════════════════════════════════════════════════════

function showLpBurnOptions() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              LP TOKEN LOCKING OPTIONS                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('OPTION A: Burn LP Tokens (MOST SECURE) 🔥');
  console.log('  - Send LP tokens to null address: 11111111111111111111111111111111');
  console.log('  - OR: Use spl-token burn');
  console.log('  - Liquidity PERMANENTLY locked');
  console.log('  - Cannot be removed by ANYONE (including team)');
  console.log('  - Standard for fair launches\n');

  console.log('OPTION B: Send to Governance (FLEXIBLE)');
  console.log('  - Send LP tokens to multisig wallet');
  console.log('  - Requires 3 of 5 votes to remove liquidity');
  console.log('  - Allows emergency liquidity removal');
  console.log('  - Less trustless than burn\n');

  console.log('OPTION C: Timelock Contract');
  console.log('  - Lock LP tokens for X months');
  console.log('  - Auto-unlock after period');
  console.log('  - More complex to implement');
  console.log('  - Common for team-funded projects\n');

  console.log('OPTION D: Burn 90%, Keep 10%');
  console.log('  - Burn majority for security');
  console.log('  - Keep small portion for emergencies');
  console.log('  - Balanced approach\n');

  console.log('🏆 RECOMMENDATION FOR 30MIN LAUNCH:');
  console.log('   → BURN 100% of LP tokens');
  console.log('   → Simplest, most secure, most trustless');
  console.log('   → Command: spl-token burn [lp-token-account] [amount]\n');
}

// ═══════════════════════════════════════════════════════
// ACTUAL IMPLEMENTATION CODE
// ═══════════════════════════════════════════════════════

async function createLpAfterBootstrap(solRaised, clwdnForLp = 400_000_000) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  EXECUTE: Create LP After Bootstrap');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`SOL Raised: ${solRaised.toLocaleString()} SOL`);
  console.log(`CLWDN for LP: ${clwdnForLp.toLocaleString()} CLWDN`);
  console.log(`Initial Price: 1 SOL = ${(clwdnForLp / solRaised).toLocaleString()} CLWDN\n`);

  console.log('STEPS:\n');
  console.log('1. Run create-pool.js:');
  console.log(`   node create-pool.js --mint ${CLWDN_MINT.toBase58()} \\`);
  console.log(`     --token-amount ${clwdnForLp * 1e9} \\`);
  console.log(`     --sol-amount ${solRaised * 1e9}\n`);

  console.log('2. Pool created! Get LP token mint address from output\n');

  console.log('3. Burn LP tokens:');
  console.log('   spl-token burn [YOUR_LP_TOKEN_ACCOUNT] [LP_TOKEN_AMOUNT] --url devnet\n');

  console.log('4. Verify burn:');
  console.log('   spl-token balance [LP_TOKEN_MINT] --url devnet');
  console.log('   (Should show 0 or very small remainder)\n');

  console.log('✅ DONE! Liquidity locked forever!\n');
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

async function main() {
  console.log('⏰ LAUNCHING IN 30 MINUTES!\n');

  await option1_bootstrapFirst();
  await option2_smallLpFirst();
  await option3_fullLpLocked();
  showRecommendation();
  showLpBurnOptions();

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                  READY TO LAUNCH! 🚀                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('FINAL CHECKLIST:\n');
  console.log('[ ] Bootstrap program initialized');
  console.log('[ ] Dispenser funded with 100M CLWDN');
  console.log('[ ] Treasury wallet ready for SOL');
  console.log('[ ] create-pool.js script ready');
  console.log('[ ] Decide: Bootstrap duration (24hr? 48hr?)');
  console.log('[ ] Announce on Twitter');
  console.log('[ ] Monitor bootstrap progress');
  console.log('[ ] After completion: Create LP');
  console.log('[ ] Burn LP tokens');
  console.log('[ ] Celebrate! 🎉\n');

  // Example: If 10K SOL raised
  console.log('\n📊 EXAMPLE WITH 10,000 SOL RAISED:\n');
  await createLpAfterBootstrap(10000, 400_000_000);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { option1_bootstrapFirst, option2_smallLpFirst, option3_fullLpLocked, createLpAfterBootstrap };
