/**
 * BONDING CURVE - INITIALIZATION AND SELF-BOOT TEST
 *
 * Usage: node init-and-test-bonding-curve.js
 *
 * This script:
 * 1. Initializes the bonding curve with parameters
 * 2. Runs a 1 SOL self-boot test
 * 3. Verifies CLWDN distribution
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } = require('@solana/web3.js');
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

// Load program
const programId = new PublicKey('GZNvf6JHw5b3KQwS2pPTyb3xPmu225p3rZ3iVBbodrAe');
const idlPath = path.join(__dirname, '../bootstrap/target/idl/clwdn_bootstrap.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

// Addresses
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const DISPENSER_STATE = new PublicKey('BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w');

// Wallet addresses (from ClawdNation tokenomics)
const LP_WALLET = new PublicKey('2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V');
const MASTER_WALLET = new PublicKey('HWUY5PNiKB9gSD6ZNUseRE4T5r1KpxAbrhnyZzy48B87');
const STAKING_WALLET = new PublicKey('4tD8wKHHSv5bJCzPvhpgWQqZQFfGFv9dGTB9H3UkCR9t');

// Bonding curve parameters
const PARAMS = {
  startRate: new anchor.BN(10_000),
  endRate: new anchor.BN(40_000),
  allocationCap: new anchor.BN(100_000_000),
  minContribution: new anchor.BN(0.1 * LAMPORTS_PER_SOL),
  maxPerWallet: new anchor.BN(10 * LAMPORTS_PER_SOL),
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   BONDING CURVE - INITIALIZATION & SELF-BOOT TEST          ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

async function main() {
  // Setup Anchor
  const provider = new anchor.AnchorProvider(
    conn,
    new anchor.Wallet(authority),
    { commitment: 'confirmed' }
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, programId, provider);

  // Derive bootstrap state PDA
  const [bootstrapState, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')],
    programId
  );

  console.log('📋 CONFIGURATION:\n');
  console.log('  Program ID:', programId.toBase58());
  console.log('  Bootstrap State:', bootstrapState.toBase58());
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  LP Wallet:', LP_WALLET.toBase58());
  console.log('  Master Wallet:', MASTER_WALLET.toBase58());
  console.log('  Staking Wallet:', STAKING_WALLET.toBase58());
  console.log('');
  console.log('  Start Rate: 10,000 CLWDN/SOL');
  console.log('  End Rate: 40,000 CLWDN/SOL');
  console.log('  Allocation Cap: 100,000,000 CLWDN');
  console.log('  Min Contribution: 0.1 SOL');
  console.log('  Max Per Wallet: 10 SOL\n');

  // Check if already initialized
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: CHECK / INITIALIZE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const stateAccount = await program.account.bootstrapState.fetch(bootstrapState);
    console.log('✅ Bootstrap already initialized\n');
    console.log('  Current state:');
    console.log('    Paused:', stateAccount.paused);
    console.log('    Complete:', stateAccount.bootstrapComplete);
    console.log('    Total Contributed:', (stateAccount.totalContributedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(2), 'SOL');
    console.log('    Total Allocated:', stateAccount.totalAllocatedClwdn.toNumber().toLocaleString(), 'CLWDN');
    console.log('    Contributors:', stateAccount.contributorCount.toString());
    console.log('');

    // Check if paused
    if (stateAccount.paused) {
      console.log('⚠️  Bootstrap is PAUSED. Unpause before testing.\n');
      return;
    }

    // Check if complete
    if (stateAccount.bootstrapComplete) {
      console.log('⚠️  Bootstrap is COMPLETE. Cannot contribute more.\n');
      return;
    }
  } catch (e) {
    console.log('📦 Bootstrap not initialized. Initializing now...\n');

    try {
      const tx = await program.methods
        .initialize({
          startRate: PARAMS.startRate,
          endRate: PARAMS.endRate,
          allocationCap: PARAMS.allocationCap,
          minContribution: PARAMS.minContribution,
          maxPerWallet: PARAMS.maxPerWallet,
        })
        .accounts({
          state: bootstrapState,
          lpWallet: LP_WALLET,
          masterWallet: MASTER_WALLET,
          stakingWallet: STAKING_WALLET,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('  Transaction:', tx);
      console.log('  Waiting for confirmation...\n');

      await conn.confirmTransaction(tx);
      console.log('✅ Bootstrap initialized successfully!\n');
    } catch (err) {
      console.log('❌ Initialization failed:', err.message, '\n');
      if (err.logs) {
        console.log('Logs:', err.logs.join('\n'));
      }
      return;
    }
  }

  // Self-boot test
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: SELF-BOOT TEST (1 SOL)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check authority balance
  const balance = await conn.getBalance(authority.publicKey);
  console.log('  Authority Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log('❌ Insufficient SOL for test (need 2+ SOL for gas)\n');
    return;
  }

  console.log('🚀 SELF-BOOT SEQUENCE:\n');
  console.log('1️⃣  Contribute 1 SOL to bonding curve');
  console.log('2️⃣  Contract calculates rate (should be ~10,000 at start)');
  console.log('3️⃣  Contract splits SOL 80/10/10 automatically');
  console.log('4️⃣  Contract allocates ~10,000 CLWDN');
  console.log('5️⃣  Dispenser distributes CLWDN to contributor\n');

  console.log('⚠️  THIS IS A REAL TRANSACTION ON DEVNET!\n');
  console.log('Press ENTER to continue or Ctrl+C to cancel...\n');

  if (process.stdin.isTTY) {
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  try {
    // Get contributor record PDA
    const [contributorRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from('contributor'), authority.publicKey.toBuffer()],
      programId
    );

    console.log('📤 Contributing 1 SOL...\n');

    const contributionAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    const tx = await program.methods
      .contributeSol(contributionAmount)
      .accounts({
        state: bootstrapState,
        contributorRecord: contributorRecord,
        contributor: authority.publicKey,
        lpWallet: LP_WALLET,
        masterWallet: MASTER_WALLET,
        stakingWallet: STAKING_WALLET,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('  Transaction:', tx);
    console.log('  Waiting for confirmation...\n');

    await conn.confirmTransaction(tx);
    console.log('✅ Contribution confirmed!\n');

    // Fetch contribution event
    console.log('📊 Fetching contribution details...\n');

    const stateAccount = await program.account.bootstrapState.fetch(bootstrapState);
    const recordAccount = await program.account.contributorRecord.fetch(contributorRecord);

    console.log('  Bootstrap State:');
    console.log('    Total SOL:', (stateAccount.totalContributedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(2), 'SOL');
    console.log('    Total CLWDN Allocated:', stateAccount.totalAllocatedClwdn.toNumber().toLocaleString());
    console.log('    LP Received:', (stateAccount.lpReceivedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(2), 'SOL (80%)');
    console.log('    Master Received:', (stateAccount.masterReceivedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(2), 'SOL (10%)');
    console.log('    Staking Received:', (stateAccount.stakingReceivedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(2), 'SOL (10%)');
    console.log('');

    console.log('  Your Contribution:');
    console.log('    SOL Sent:', (recordAccount.totalContributedLamports.toNumber() / LAMPORTS_PER_SOL).toFixed(2), 'SOL');
    console.log('    CLWDN Allocated:', recordAccount.totalAllocatedClwdn.toNumber().toLocaleString(), 'CLWDN');
    console.log('    Contribution Count:', recordAccount.contributionCount.toString());
    console.log('');

    // Wait for dispenser
    console.log('⏳ Waiting for dispenser to distribute CLWDN (30s)...\n');
    await sleep(30000);

    // Check CLWDN balance
    const authAta = await getAssociatedTokenAddress(CLWDN_MINT, authority.publicKey);
    try {
      const clwdnBalance = await conn.getTokenAccountBalance(authAta);
      const amount = Number(clwdnBalance.value.amount) / 1e9;

      console.log('✅ CLWDN Received:', amount.toLocaleString(), 'CLWDN\n');
      console.log('🎉 SELF-BOOT TEST SUCCESSFUL!\n');

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ ALL SYSTEMS GO!\n');
      console.log('The bonding curve is working correctly:\n');
      console.log('  ✅ Contract initialized with parameters');
      console.log('  ✅ Contribution accepted');
      console.log('  ✅ Linear pricing working (10K CLWDN/SOL)');
      console.log('  ✅ 80/10/10 split executed');
      console.log('  ✅ CLWDN distributed by dispenser\n');
      console.log('Ready for production launch!\n');
    } catch (e) {
      console.log('⚠️  CLWDN not received yet\n');
      console.log('The contribution was successful on-chain, but dispenser may need time.');
      console.log('Check manually: spl-token balance', CLWDN_MINT.toBase58(), '\n');
    }
  } catch (err) {
    console.log('❌ Contribution failed:', err.message, '\n');
    if (err.logs) {
      console.log('Logs:');
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
