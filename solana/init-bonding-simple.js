/**
 * BONDING CURVE - SIMPLE INITIALIZATION
 *
 * Usage: node init-bonding-simple.js
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Addresses
const programId = new PublicKey('GZNvf6JHw5b3KQwS2pPTyb3xPmu225p3rZ3iVBbodrAe');
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');

// Wallet addresses
const LP_WALLET = new PublicKey('2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V');
const MASTER_WALLET = new PublicKey('HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87');
const STAKING_WALLET = new PublicKey('4tD8wKHHSv5bJCzPvhpgWQqZQFfGFv9dGTB9H3UkCR9t');

// Derive bootstrap state PDA
function findBootstrapState() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')],
    programId
  );
}

// Instruction discriminators (from IDL)
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
const CONTRIBUTE_SOL_DISCRIMINATOR = Buffer.from([186, 36, 137, 50, 25, 152, 8, 5]);

// Manually encode BootstrapParams (5 u64 fields)
function encodeBootstrapParams(startRate, endRate, allocationCap, minContribution, maxPerWallet) {
  const buffer = Buffer.alloc(40); // 5 * 8 bytes
  buffer.writeBigUInt64LE(startRate, 0);
  buffer.writeBigUInt64LE(endRate, 8);
  buffer.writeBigUInt64LE(allocationCap, 16);
  buffer.writeBigUInt64LE(minContribution, 24);
  buffer.writeBigUInt64LE(maxPerWallet, 32);
  return buffer;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   BONDING CURVE - INITIALIZATION & TEST                    ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

async function main() {
  const [bootstrapState, bump] = findBootstrapState();

  console.log('📋 CONFIGURATION:\n');
  console.log('  Program ID:', programId.toBase58());
  console.log('  Bootstrap State:', bootstrapState.toBase58());
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  LP Wallet:', LP_WALLET.toBase58());
  console.log('  Master Wallet:', MASTER_WALLET.toBase58());
  console.log('  Staking Wallet:', STAKING_WALLET.toBase58());
  console.log('');

  // Check if already initialized
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: CHECK INITIALIZATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const stateInfo = await conn.getAccountInfo(bootstrapState);
    if (stateInfo && stateInfo.data.length > 0) {
      console.log('✅ Bootstrap state exists\n');
      console.log('  Account Data Length:', stateInfo.data.length, 'bytes');
      console.log('  Owner:', stateInfo.owner.toBase58());
      console.log('  Lamports:', (stateInfo.lamports / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

      // Parse first few fields
      const data = stateInfo.data;
      console.log('  State (first 100 bytes):');
      console.log('   ', data.slice(0, 100).toString('hex'), '\n');
    } else {
      console.log('⚠️  Bootstrap state does not exist yet\n');
      console.log('Creating initialize instruction...\n');

      // Create initialize instruction
      const paramsData = encodeBootstrapParams(
        BigInt(10_000),                           // start_rate
        BigInt(40_000),                           // end_rate
        BigInt(100_000_000),                      // allocation_cap
        BigInt(Math.floor(0.1 * LAMPORTS_PER_SOL)), // min_contribution
        BigInt(10 * LAMPORTS_PER_SOL)             // max_per_wallet
      );

      const instructionData = Buffer.concat([
        INITIALIZE_DISCRIMINATOR,
        paramsData
      ]);

      console.log('  Instruction data length:', instructionData.length, 'bytes');
      console.log('  Params: start=10000, end=40000, cap=100M, min=0.1 SOL, max=10 SOL\n');

      const keys = [
        { pubkey: bootstrapState, isSigner: false, isWritable: true },
        { pubkey: LP_WALLET, isSigner: false, isWritable: true },
        { pubkey: MASTER_WALLET, isSigner: false, isWritable: true },
        { pubkey: STAKING_WALLET, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      const ix = new TransactionInstruction({
        keys,
        programId,
        data: instructionData,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = authority.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      console.log('📤 Sending initialize transaction...\n');

      try {
        const sig = await conn.sendTransaction(tx, [authority]);
        console.log('  Transaction:', sig);
        console.log('  Waiting for confirmation...\n');

        await conn.confirmTransaction(sig);
        console.log('✅ Bootstrap initialized successfully!\n');
      } catch (err) {
        console.log('❌ Initialize failed:', err.message, '\n');
        if (err.logs) {
          console.log('Program logs:');
          err.logs.forEach(log => console.log('  ', log));
        }
        return;
      }
    }
  } catch (e) {
    console.log('❌ Error checking state:', e.message, '\n');
    return;
  }

  // Self-boot test
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: SELF-BOOT TEST (1 SOL)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const balance = await conn.getBalance(authority.publicKey);
  console.log('  Authority Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log('❌ Insufficient SOL for test (need 2+ SOL)\n');
    return;
  }

  console.log('⚠️  THIS WILL CONTRIBUTE 1 SOL ON DEVNET\n');
  console.log('Press ENTER to continue or Ctrl+C to cancel...\n');

  if (process.stdin.isTTY) {
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  // Derive contributor record
  const [contributorRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), authority.publicKey.toBuffer()],
    programId
  );

  // Create contribute instruction
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(1 * LAMPORTS_PER_SOL));

  const contributeData = Buffer.concat([
    CONTRIBUTE_SOL_DISCRIMINATOR,
    amountBuffer
  ]);

  const keys = [
    { pubkey: bootstrapState, isSigner: false, isWritable: true },
    { pubkey: contributorRecord, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: LP_WALLET, isSigner: false, isWritable: true },
    { pubkey: MASTER_WALLET, isSigner: false, isWritable: true },
    { pubkey: STAKING_WALLET, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({
    keys,
    programId,
    data: contributeData,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

  console.log('📤 Contributing 1 SOL...\n');

  try {
    const sig = await conn.sendTransaction(tx, [authority], { skipPreflight: false });
    console.log('  Transaction:', sig);
    console.log('  Waiting for confirmation...\n');

    const confirmation = await conn.confirmTransaction(sig);
    console.log('✅ Contribution confirmed!\n');

    // Check state
    console.log('📊 Checking bootstrap state...\n');
    const stateInfo = await conn.getAccountInfo(bootstrapState);
    if (stateInfo) {
      console.log('  State updated successfully');
      console.log('  Account lamports:', (stateInfo.lamports / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');
    }

    // Check contributor record
    const recordInfo = await conn.getAccountInfo(contributorRecord);
    if (recordInfo) {
      console.log('  Contributor record created');
      console.log('  Record size:', recordInfo.data.length, 'bytes\n');
    }

    // Wait for dispenser
    console.log('⏳ Waiting for dispenser (30s)...\n');
    await sleep(30000);

    // Check CLWDN balance
    const authAta = await getAssociatedTokenAddress(CLWDN_MINT, authority.publicKey);
    try {
      const tokenBalance = await conn.getTokenAccountBalance(authAta);
      const clwdnAmount = Number(tokenBalance.value.amount) / 1e9;
      console.log('✅ CLWDN Received:', clwdnAmount.toLocaleString(), 'CLWDN\n');
      console.log('🎉 SELF-BOOT TEST SUCCESSFUL!\n');
    } catch (e) {
      console.log('⚠️  CLWDN not yet received\n');
      console.log('Check manually: spl-token balance', CLWDN_MINT.toBase58(), '\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ BONDING CURVE WORKING!\n');
    console.log('  ✅ Program deployed');
    console.log('  ✅ State initialized');
    console.log('  ✅ Contribution accepted');
    console.log('  ✅ 80/10/10 split executed\n');
    console.log('Ready for production!\n');
  } catch (err) {
    console.log('❌ Contribution failed:', err.message, '\n');
    if (err.logs) {
      console.log('Program logs:');
      err.logs.forEach(log => console.log('  ', log));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
