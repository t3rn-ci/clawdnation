/**
 * INITIALIZE BOOTSTRAP WITH AUTOMATIC 80/10/10 SPLIT
 *
 * Sets up bootstrap program with 3 destination wallets:
 * - LP Wallet (80%)
 * - Master Wallet (10%)
 * - Staking Wallet (10%)
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Program IDs
const BOOTSTRAP_PROGRAM_ID = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');

// Configuration
const CONFIG = {
  targetSol: 100, // Target 100 SOL raise (change to 10000 for mainnet)
  allocationCap: 100_000_000, // 100M CLWDN for bootstrap
};

// Wallet configuration (CHANGE THESE FOR PRODUCTION!)
const LP_WALLET = authority.publicKey; // 80% - For creating LP
const MASTER_WALLET = authority.publicKey; // 10% - ClawdNation protocol fee
const STAKING_WALLET = authority.publicKey; // 10% - Staking rewards

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   INITIALIZE BOOTSTRAP WITH AUTO 80/10/10 SPLIT            ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

async function main() {
  console.log('📋 CONFIGURATION:\n');
  console.log(`   Target: ${CONFIG.targetSol} SOL`);
  console.log(`   Allocation Cap: ${CONFIG.allocationCap.toLocaleString()} CLWDN`);
  console.log(`   Authority: ${authority.publicKey.toBase58()}\n`);

  console.log('💰 WALLET DISTRIBUTION (80/10/10):\n');
  console.log(`   LP Wallet (80%): ${LP_WALLET.toBase58()}`);
  console.log(`   Master Wallet (10%): ${MASTER_WALLET.toBase58()}`);
  console.log(`   Staking Wallet (10%): ${STAKING_WALLET.toBase58()}\n`);

  if (
    LP_WALLET.equals(authority.publicKey) &&
    MASTER_WALLET.equals(authority.publicKey) &&
    STAKING_WALLET.equals(authority.publicKey)
  ) {
    console.log('⚠️  WARNING: All wallets are the same (authority)!');
    console.log('   This is OK for testing, but for production:');
    console.log('   - Set LP_WALLET to a dedicated wallet for LP creation');
    console.log('   - Set MASTER_WALLET to ClawdNation treasury');
    console.log('   - Set STAKING_WALLET to staking rewards wallet\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Derive bootstrap state PDA
  const [bootstrapState] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')],
    BOOTSTRAP_PROGRAM_ID
  );

  console.log('📍 ADDRESSES:\n');
  console.log(`   Bootstrap Program: ${BOOTSTRAP_PROGRAM_ID.toBase58()}`);
  console.log(`   Bootstrap State: ${bootstrapState.toBase58()}\n`);

  // Check if already initialized
  try {
    const stateInfo = await conn.getAccountInfo(bootstrapState);
    if (stateInfo) {
      console.log('⚠️  Bootstrap already initialized!');
      console.log('   State account exists.\n');
      console.log('   To reinitialize:');
      console.log('   1. Close the existing account');
      console.log('   2. Or use a different program ID\n');
      return;
    }
  } catch (e) {
    // Account doesn't exist, proceed
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔨 DEPLOYING BOOTSTRAP PROGRAM:\n');

  console.log('STEP 1: Build and deploy\n');
  console.log('   cd bootstrap');
  console.log('   cp programs/bootstrap/src/lib_auto_split.rs programs/bootstrap/src/lib.rs');
  console.log('   anchor build');
  console.log('   anchor deploy --provider.cluster devnet\n');

  console.log('STEP 2: Initialize (run this script again after deploy)\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 INITIALIZATION TRANSACTION:\n');

  console.log('Manual initialization:');
  console.log('   cd bootstrap');
  console.log('   anchor run initialize \\');
  console.log(`     --target-sol ${CONFIG.targetSol} \\`);
  console.log(`     --allocation-cap ${CONFIG.allocationCap} \\`);
  console.log(`     --lp-wallet ${LP_WALLET.toBase58()} \\`);
  console.log(`     --master-wallet ${MASTER_WALLET.toBase58()} \\`);
  console.log(`     --staking-wallet ${STAKING_WALLET.toBase58()}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ AFTER INITIALIZATION:\n');
  console.log('   Bootstrap state will be created at:');
  console.log(`   ${bootstrapState.toBase58()}\n`);
  console.log('   Users can send SOL to this address');
  console.log('   SOL will automatically split 80/10/10\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🚀 NEXT STEPS:\n');
  console.log('   1. Deploy bootstrap program (anchor deploy)');
  console.log('   2. Initialize with 3 wallet addresses');
  console.log('   3. Fund dispenser with 100M+ CLWDN');
  console.log('   4. Run: node launch.js --bootstrap --raise-target 100\n');

  console.log('📋 SAVE THIS INFO:\n');
  const initInfo = {
    network: 'devnet',
    bootstrapProgram: BOOTSTRAP_PROGRAM_ID.toBase58(),
    bootstrapState: bootstrapState.toBase58(),
    config: CONFIG,
    wallets: {
      lp: LP_WALLET.toBase58(),
      master: MASTER_WALLET.toBase58(),
      staking: STAKING_WALLET.toBase58(),
    },
    solDistribution: {
      lp: '80%',
      master: '10%',
      staking: '10%',
    },
  };

  fs.writeFileSync(
    path.join(__dirname, 'bootstrap-config.json'),
    JSON.stringify(initInfo, null, 2)
  );

  console.log('   Saved to: bootstrap-config.json\n');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
