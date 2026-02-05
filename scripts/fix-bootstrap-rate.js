/**
 * Fix Bootstrap Rate - Upgrade Script
 *
 * Problem: Current bootstrap has wrong rate (100 CLWDN/SOL instead of 10,000 CLWDN/SOL)
 * Solution: This is an INFORMATIONAL script showing the issue and options
 *
 * CRITICAL FINDINGS:
 * 1. Current on-chain startRate: 100,000,000,000 (100 CLWDN/SOL)
 * 2. Expected startRate: 10,000,000,000,000 (10,000 CLWDN/SOL)
 * 3. Users are getting 1/100th the tokens they should!
 *
 * OPTIONS:
 *
 * A) CANNOT USE update_params:
 *    - Requires total_contributed_lamports == 0
 *    - We already have 0.02 SOL contributed
 *    - This option is BLOCKED
 *
 * B) Deploy NEW bootstrap program with correct rate:
 *    - Requires redeploying/upgrading the program
 *    - Need program upgrade authority
 *    - Existing contributions would need manual migration/refund
 *
 * C) Live with the bug and adjust website display:
 *    - Show actual rate (0.01 SOL per CLWDN)
 *    - Update marketing to match reality
 *    - Simplest solution
 *
 * D) Initialize NEW bootstrap instance (if program supports multiple):
 *    - Keep old one for record
 *    - Start fresh with correct params
 *    - Refund 0.02 SOL to contributor manually
 */

require('dotenv').config();
const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require('@solana/web3.js');
const { AnchorProvider, Program, web3 } = require('@coral-xyz/anchor');

const NETWORK = process.env.NETWORK || 'mainnet';
const RPC = process.env.SOLANA_RPC;
const BOOTSTRAP_PROGRAM = new PublicKey('91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No');

async function analyzeBootstrap() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BOOTSTRAP RATE FIX ANALYSIS');
  console.log('═══════════════════════════════════════════════\n');

  const connection = new Connection(RPC, 'confirmed');

  // Get bootstrap state
  const [stateKey] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')],
    BOOTSTRAP_PROGRAM
  );

  const stateAccount = await connection.getAccountInfo(stateKey);
  if (!stateAccount) {
    console.log('❌ Bootstrap state account not found');
    return;
  }

  const data = stateAccount.data;
  let off = 8 + 32 + 1;  // disc + authority + pending option tag

  // Check if pending_authority is Some
  if (data[40] === 1) {
    off += 32;  // Skip the pubkey
  }

  off += 96;  // Skip 3 wallets (lp, master, staking)

  const startRate = data.readBigUInt64LE(off); off += 8;
  const endRate = data.readBigUInt64LE(off); off += 8;
  const allocationCap = data.readBigUInt64LE(off); off += 8;
  const minContribution = data.readBigUInt64LE(off); off += 8;
  const maxPerWallet = data.readBigUInt64LE(off); off += 8;

  off += 2;  // Skip 2 bools (paused, complete)

  const totalContributed = data.readBigUInt64LE(off); off += 8;
  const totalAllocated = data.readBigUInt64LE(off); off += 8;
  const contributorCount = data.readBigUInt64LE(off);

  console.log('📊 CURRENT STATE:');
  console.log('─────────────────────────────────────────────\n');
  console.log('Bootstrap Account:', stateKey.toBase58());
  console.log('');
  console.log('RATES:');
  console.log('  Current startRate (raw):', Number(startRate).toLocaleString());
  console.log('  Current startRate (CLWDN/SOL):', Number(startRate) / 1e9);
  console.log('  ❌ WRONG - Should be: 10,000 CLWDN/SOL');
  console.log('  ❌ Actual rate is 100x too low!');
  console.log('');
  console.log('CONTRIBUTIONS:');
  console.log('  Total SOL:', Number(totalContributed) / 1e9);
  console.log('  Total CLWDN allocated:', Number(totalAllocated) / 1e9);
  console.log('  ❌ Should have allocated:', (Number(totalContributed) / 1e9) * 10000, 'CLWDN');
  console.log('  ❌ Missing:', ((Number(totalContributed) / 1e9) * 10000) - (Number(totalAllocated) / 1e9), 'CLWDN');
  console.log('');

  console.log('\n═══════════════════════════════════════════════');
  console.log('  RECOMMENDED ACTIONS:');
  console.log('═══════════════════════════════════════════════\n');

  if (Number(totalContributed) === 0) {
    console.log('✅ OPTION: Use update_params');
    console.log('   No contributions yet - can safely update params');
    console.log('   Run: npm run fix-bootstrap-rate update');
  } else {
    console.log('❌ Cannot use update_params (contributions exist)');
    console.log('');
    console.log('✅ OPTION 1: Manual Refund + Fresh Start');
    console.log('   1. Manually refund', Number(totalContributed) / 1e9, 'SOL to contributor');
    console.log('   2. Close current bootstrap state');
    console.log('   3. Initialize new bootstrap with correct rate');
    console.log('   Cost: ~0.02 SOL refund + gas fees');
    console.log('');
    console.log('✅ OPTION 2: Accept Current Rate');
    console.log('   1. Update website to show 0.01 SOL per CLWDN');
    console.log('   2. Adjust allocation_cap to 1M CLWDN (instead of 100M)');
    console.log('   3. Continue with current setup');
    console.log('   Cost: $0 - just marketing adjustment');
    console.log('');
    console.log('✅ OPTION 3: Program Upgrade (Advanced)');
    console.log('   1. Add migration instruction to program');
    console.log('   2. Redeploy program with upgrade authority');
    console.log('   3. Run migration to fix rate + credit users');
    console.log('   Cost: High complexity, requires Rust changes');
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  CORRECT PARAMETERS:');
  console.log('═══════════════════════════════════════════════\n');
  console.log('start_rate:', (10_000 * 1e9).toLocaleString(), '(10,000 CLWDN/SOL)');
  console.log('end_rate:', (10_000 * 1e9).toLocaleString(), '(fixed rate)');
  console.log('allocation_cap:', (100_000_000 * 1e9).toLocaleString(), '(100M CLWDN)');
  console.log('min_contribution:', '10000000 (0.01 SOL minimum)');
  console.log('max_per_wallet:', '100000000000 (100 SOL max)');

  console.log('\n');
}

if (require.main === module) {
  analyzeBootstrap().catch(console.error);
}

module.exports = { analyzeBootstrap };
