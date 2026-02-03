#!/usr/bin/env node
/**
 * Local test script for ClawdNation Bootstrap → Dispenser flow
 * Uses local keypair at ~/.config/solana/id.json
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Use local keypair
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
console.log('Loading keypair from:', KEYPAIR_PATH);
const authorityKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const CLWDN_MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');
const BOOTSTRAP_PROGRAM = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');
const DISPENSER_PROGRAM = new PublicKey('fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi');

const [BOOTSTRAP_STATE] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
const [DISPENSER_STATE] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

function anchorDisc(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBootstrapFlow() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    ClawdNation Bootstrap Flow Test (Local)        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const authorityBal = await conn.getBalance(authority.publicKey);
  console.log('Authority:', authority.publicKey.toBase58());
  console.log('Balance:', authorityBal / LAMPORTS_PER_SOL, 'SOL\n');

  // Check program states
  console.log('━━━ Program Status ━━━');
  const bState = await conn.getAccountInfo(BOOTSTRAP_STATE);
  const dState = await conn.getAccountInfo(DISPENSER_STATE);
  console.log('Bootstrap State:', bState ? '✅ Initialized' : '❌ Not initialized');
  console.log('Dispenser State:', dState ? '✅ Initialized' : '❌ Not initialized');

  // Check vault
  const vault = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true, TOKEN_PROGRAM_ID);
  console.log('Vault:', vault.toBase58());
  try {
    const vaultAcct = await getAccount(conn, vault, 'confirmed', TOKEN_PROGRAM_ID);
    console.log('Vault Balance:', Number(vaultAcct.amount) / 1e9, 'CLWDN');
  } catch (e) {
    console.log('Vault not found');
    return;
  }
  console.log();

  // Create test contributor
  console.log('━━━ Creating Test Contribution ━━━');
  const contributor = Keypair.generate();
  console.log('Test contributor:', contributor.publicKey.toBase58());

  // Fund contributor
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: contributor.publicKey,
      lamports: 0.15 * LAMPORTS_PER_SOL, // 0.15 SOL (0.1 for contribution + fees)
    })
  );
  const fundSig = await conn.sendTransaction(fundTx, [authority]);
  await conn.confirmTransaction(fundSig, 'confirmed');
  console.log('Funded with 0.15 SOL');

  // Contribute 0.1 SOL
  console.log('\n━━━ Sending Contribution (0.1 SOL → 1000 CLWDN) ━━━');
  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), contributor.publicKey.toBuffer()],
    BOOTSTRAP_PROGRAM
  );
  console.log('Contributor PDA:', contributorPda.toBase58());

  const contribDisc = anchorDisc('contribute_sol');
  const contribData = Buffer.alloc(8 + 8);
  contribDisc.copy(contribData, 0);
  contribData.writeBigUInt64LE(BigInt(0.1 * LAMPORTS_PER_SOL), 8);

  const contribIx = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: BOOTSTRAP_STATE, isSigner: false, isWritable: true },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: contributor.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: true }, // treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: contribData,
  });

  const contribTx = new Transaction().add(contribIx);
  const contribSig = await conn.sendTransaction(contribTx, [contributor]);
  await conn.confirmTransaction(contribSig, 'confirmed');
  console.log('✅ Contribution sent!');
  console.log('   TX:', contribSig);
  console.log('   Explorer: https://explorer.solana.com/tx/' + contribSig + '?cluster=devnet');

  // Verify contributor record
  const record = await conn.getAccountInfo(contributorPda);
  if (record) {
    const data = record.data;
    const totalLamports = data.readBigUInt64LE(40);
    const totalClwdn = data.readBigUInt64LE(48);
    const count = data.readBigUInt64LE(56);
    const distributed = data[72] === 1;

    console.log('\n━━━ On-Chain Record ━━━');
    console.log('Total contributed:', Number(totalLamports) / LAMPORTS_PER_SOL, 'SOL');
    console.log('Total allocated:', Number(totalClwdn) / 1e9, 'CLWDN');
    console.log('Contribution count:', Number(count));
    console.log('Distributed:', distributed ? 'YES' : 'NO');
  }

  console.log('\n━━━ Waiting for Dispenser Service ━━━');
  console.log('The dispenser service polls every 15 seconds.');
  console.log('You need to run: node solana/dispenser-service-local.js');
  console.log('\nWatching for CLWDN tokens... (60s timeout)');

  const contributorAta = await getAssociatedTokenAddress(
    CLWDN_MINT,
    contributor.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  console.log('Watching ATA:', contributorAta.toBase58());

  let receivedClwdn = false;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    process.stdout.write(`  ${(i + 1) * 5}s... `);

    try {
      const tokenAcct = await getAccount(conn, contributorAta, 'confirmed', TOKEN_PROGRAM_ID);
      if (tokenAcct.amount > 0n) {
        console.log('\n\n🎉 CLWDN RECEIVED!');
        console.log('   Balance:', Number(tokenAcct.amount) / 1e9, 'CLWDN');
        receivedClwdn = true;
        break;
      }
    } catch (e) {
      // ATA doesn't exist yet
    }

    // Check if marked as distributed
    const rec = await conn.getAccountInfo(contributorPda);
    if (rec && rec.data[72] === 1) {
      console.log('\n✅ Marked as distributed on bootstrap!');
      receivedClwdn = true;
      break;
    }
  }

  if (!receivedClwdn) {
    console.log('\n\n⏰ Timeout - dispenser service may not be running');
    console.log('Start it with: node solana/dispenser-service-local.js');
  }

  console.log('\n━━━ Test Complete ━━━\n');
}

if (require.main === module) {
  testBootstrapFlow().catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
}

module.exports = { testBootstrapFlow };
