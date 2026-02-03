/**
 * EMERGENCY LP CREATION - TEST MODE
 *
 * Creates a minimal LP pool with current bootstrap funds
 * Usage: node create-emergency-lp.js
 *
 * ⚠️  This is for TESTING ONLY - simulates LP creation before bootstrap completes
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority (LP wallet owner)
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Addresses
const CLWDN_MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');
const LP_WALLET = new PublicKey('2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V');

// Raydium CPMM (Constant Product Market Maker)
const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║        EMERGENCY LP CREATION - TEST MODE                   ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('⚠️  WARNING: This creates LP with CURRENT funds (not full bootstrap)');
console.log('   Only for testing LP creation flow!\n');

async function main() {
  console.log('📋 CONFIGURATION:\n');
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  LP Wallet:', LP_WALLET.toBase58());
  console.log('  CLWDN Mint:', CLWDN_MINT.toBase58());
  console.log('  Raydium CPMM:', RAYDIUM_CPMM_PROGRAM.toBase58());
  console.log('');

  // Check LP wallet balance
  const lpBalance = await conn.getBalance(LP_WALLET);
  const lpSOL = lpBalance / LAMPORTS_PER_SOL;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: CHECK CURRENT FUNDS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  LP Wallet Balance:', lpSOL.toFixed(4), 'SOL');

  if (lpSOL < 0.1) {
    console.log('\n❌ Insufficient SOL in LP wallet (need at least 0.1 SOL for test)\n');
    return;
  }

  // Calculate CLWDN for LP based on 40K rate (final bootstrap rate)
  const finalBootstrapRate = 40_000; // CLWDN per SOL
  const lpCLWDN = Math.floor(lpSOL * finalBootstrapRate);

  console.log('  CLWDN for LP (dynamic):', lpCLWDN.toLocaleString(), 'CLWDN');
  console.log('  Initial LP Rate:', finalBootstrapRate.toLocaleString(), 'CLWDN/SOL');
  console.log('  (Matches final bootstrap rate - no arbitrage!)\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: SIMULATE LP CREATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  This would create a Raydium CPMM pool with:\n');
  console.log('  Input A (SOL):', lpSOL.toFixed(4), 'SOL');
  console.log('  Input B (CLWDN):', lpCLWDN.toLocaleString(), 'CLWDN');
  console.log('  Pool Type: Constant Product (x * y = k)');
  console.log('  Initial Price: 1 SOL =', finalBootstrapRate.toLocaleString(), 'CLWDN');
  console.log('');

  console.log('  LP Token Minted: ~', Math.sqrt(lpSOL * lpCLWDN).toFixed(2), 'LP tokens');
  console.log('  LP Token Owner: Authority (will be burned!)');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 3: RAYDIUM CPMM INTEGRATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  To create the actual pool, you need to:\n');
  console.log('  1. Call Raydium CPMM initialize instruction');
  console.log('  2. Parameters:');
  console.log('     - Token A: SOL (native)');
  console.log('     - Token B: CLWDN (SPL token)');
  console.log('     - Amount A:', lpSOL.toFixed(4), 'SOL');
  console.log('     - Amount B:', lpCLWDN.toLocaleString(), 'CLWDN');
  console.log('     - Fee tier: 0.3% (standard)');
  console.log('  3. Receive LP token mint address');
  console.log('  4. Burn ALL LP tokens immediately!');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 4: EXAMPLE RAYDIUM COMMAND\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Using Raydium CLI or SDK:\n');
  console.log('  ```');
  console.log('  raydium cpmm create \\');
  console.log('    --token-a So11111111111111111111111111111111111111112 \\  # SOL');
  console.log('    --token-b', CLWDN_MINT.toBase58(), '\\');
  console.log('    --amount-a', (lpSOL * LAMPORTS_PER_SOL).toFixed(0), '\\  # lamports');
  console.log('    --amount-b', (lpCLWDN * 1e9).toFixed(0), '\\  # CLWDN base units');
  console.log('    --fee-rate 30 \\  # 0.3%');
  console.log('    --authority', authority.publicKey.toBase58());
  console.log('  ```\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 5: POST-CREATION MANDATORY STEPS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  CRITICAL: After pool creation:\n');
  console.log('  1. Find LP token mint address from transaction');
  console.log('  2. Check your LP token balance:');
  console.log('     spl-token balance <LP_MINT> --url devnet');
  console.log('  3. Burn ALL LP tokens:');
  console.log('     spl-token burn <LP_TOKEN_ACCOUNT> ALL --url devnet');
  console.log('  4. Verify burn:');
  console.log('     spl-token balance <LP_MINT> --url devnet  # Should be 0');
  console.log('  5. Pool is now permanently locked! ✅');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ SIMULATION COMPLETE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  This script simulated LP creation with current funds.');
  console.log('  For PRODUCTION, wait for full bootstrap to complete!');
  console.log('');
  console.log('  Expected production LP:');
  console.log('    SOL: ~3,200 SOL (80% of ~4,000 raised)');
  console.log('    CLWDN: ~128,000,000 (3,200 × 40K)');
  console.log('');
  console.log('  Ready to create actual pool? See Raydium docs:');
  console.log('  https://docs.raydium.io/raydium/pool-creation/creating-a-cpmm');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
