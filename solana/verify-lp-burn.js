#!/usr/bin/env node
/**
 * LP BURN VERIFICATION SCRIPT
 *
 * Verifies that LP tokens have been burned and pool is permanently locked
 *
 * Usage:
 *   node verify-lp-burn.js <LP_MINT_ADDRESS> [--mainnet]
 *
 * Example:
 *   node verify-lp-burn.js EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --mainnet
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Parse arguments
const args = process.argv.slice(2);
const lpMintAddress = args[0];
const isMainnet = args.includes('--mainnet');

if (!lpMintAddress) {
  console.error('❌ Usage: node verify-lp-burn.js <LP_MINT_ADDRESS> [--mainnet]');
  console.error('');
  console.error('Example:');
  console.error('  node verify-lp-burn.js EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  console.error('  node verify-lp-burn.js EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --mainnet');
  process.exit(1);
}

const NETWORK = isMainnet ? 'mainnet-beta' : 'devnet';
const RPC = isMainnet
  ? (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
  : (process.env.DEVNET_RPC || 'https://api.devnet.solana.com');

const conn = new Connection(RPC, 'confirmed');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║           LP BURN VERIFICATION                            ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('📋 CONFIGURATION:\n');
console.log('  Network:', NETWORK);
console.log('  RPC:', RPC);
console.log('  LP Mint:', lpMintAddress);
console.log('');

async function verifyBurn() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('STEP 1: FETCH LP MINT INFO\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const lpMint = new PublicKey(lpMintAddress);
    const mintInfo = await getMint(conn, lpMint, 'confirmed', TOKEN_PROGRAM_ID);

    console.log('  LP Mint Info:');
    console.log('    Address:', lpMint.toBase58());
    console.log('    Decimals:', mintInfo.decimals);
    console.log('    Supply:', Number(mintInfo.supply).toLocaleString());
    console.log('    Mint Authority:', mintInfo.mintAuthority ? mintInfo.mintAuthority.toBase58() : 'None');
    console.log('    Freeze Authority:', mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toBase58() : 'None');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('STEP 2: VERIFY LP BURN\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const checks = [];

    // Check 1: Supply = 0
    const supplyCheck = Number(mintInfo.supply) === 0;
    checks.push({
      name: 'Supply is 0',
      status: supplyCheck,
      value: Number(mintInfo.supply),
      expected: 0,
      impact: 'All LP tokens burned - no one can remove liquidity'
    });

    // Check 2: Mint Authority = null
    const mintAuthorityCheck = mintInfo.mintAuthority === null;
    checks.push({
      name: 'Mint Authority is None',
      status: mintAuthorityCheck,
      value: mintInfo.mintAuthority ? 'Set' : 'None',
      expected: 'None',
      impact: 'Cannot mint new LP tokens - supply is fixed'
    });

    // Check 3: Freeze Authority = null
    const freezeAuthorityCheck = mintInfo.freezeAuthority === null;
    checks.push({
      name: 'Freeze Authority is None',
      status: freezeAuthorityCheck,
      value: mintInfo.freezeAuthority ? 'Set' : 'None',
      expected: 'None',
      impact: 'Cannot freeze token accounts'
    });

    // Display checks
    checks.forEach((check, i) => {
      const icon = check.status ? '✅' : '❌';
      console.log(`  ${icon} Check ${i + 1}: ${check.name}`);
      console.log(`     Value: ${check.value}`);
      console.log(`     Expected: ${check.expected}`);
      console.log(`     Impact: ${check.impact}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('STEP 3: FINAL VERDICT\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const allChecksPassed = checks.every(check => check.status);

    if (allChecksPassed) {
      console.log('✅ LP TOKENS BURNED - POOL PERMANENTLY LOCKED\n');
      console.log('  🔒 Liquidity cannot be removed');
      console.log('  🔒 No new LP tokens can be minted');
      console.log('  🔒 Pool is safe for trading');
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 VERIFICATION SUCCESSFUL');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log('Explorer Links:');
      console.log(`  LP Mint: https://explorer.solana.com/address/${lpMint.toBase58()}?cluster=${NETWORK === 'mainnet-beta' ? 'mainnet' : 'devnet'}`);
      console.log('');

      return true;
    } else {
      console.log('⚠️  LP TOKENS NOT FULLY BURNED\n');
      console.log('  Failed Checks:');
      checks.filter(c => !c.status).forEach(check => {
        console.log(`    ❌ ${check.name}`);
      });
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚨 VERIFICATION FAILED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log('⚠️  WARNING: Pool may not be safe!');
      console.log('   The LP tokens have not been fully burned.');
      console.log('   Do NOT trade on this pool until the issue is resolved.\n');

      console.log('Explorer Links:');
      console.log(`  LP Mint: https://explorer.solana.com/address/${lpMint.toBase58()}?cluster=${NETWORK === 'mainnet-beta' ? 'mainnet' : 'devnet'}`);
      console.log('');

      return false;
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('\nPossible reasons:');
    console.error('  - Invalid LP mint address');
    console.error('  - Network connection issues');
    console.error('  - Wrong network (try --mainnet flag)');
    console.error('');
    return false;
  }
}

verifyBurn()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
