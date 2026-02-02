#!/usr/bin/env node
/**
 * Dispenser Service (Local) — watches bootstrap for new contributions and distributes CLWDN
 * Modified to use local keypair at ~/.config/solana/id.json
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
console.log('Loading authority keypair from:', KEYPAIR_PATH);
const authorityKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const DISPENSER_PROGRAM = new PublicKey('fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi');
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');

const [DISPENSER_STATE] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);
const [BOOTSTRAP_STATE] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);

let VAULT = null;

function anchorDisc(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

function accountDisc(name) {
  return crypto.createHash('sha256').update(`account:${name}`).digest().slice(0, 8);
}

async function getOrCreateVault() {
  if (VAULT) return VAULT;
  const ata = await getOrCreateAssociatedTokenAccount(
    conn, authority, CLWDN_MINT, DISPENSER_STATE, true, 'confirmed', undefined, TOKEN_PROGRAM_ID
  );
  VAULT = ata.address;
  console.log('Vault:', VAULT.toBase58(), 'Balance:', Number(ata.amount) / 1e9, 'CLWDN');
  return VAULT;
}

function parseContributorRecord(data) {
  const contributor = new PublicKey(data.slice(8, 40));
  const totalContributedLamports = data.readBigUInt64LE(40);
  const totalAllocatedClwdn = data.readBigUInt64LE(48);
  const contributionCount = data.readBigUInt64LE(56);
  const lastContributionAt = data.readBigInt64LE(64);
  const distributed = data[72] === 1;
  return { contributor, totalContributedLamports, totalAllocatedClwdn, contributionCount, lastContributionAt, distributed };
}

async function findUndistributedContributions() {
  const disc = accountDisc('ContributorRecord');
  const accounts = await conn.getProgramAccounts(BOOTSTRAP_PROGRAM, {
    filters: [{ memcmp: { offset: 0, bytes: require('bs58').encode(disc) } }],
  });

  const undistributed = [];
  for (const { pubkey, account } of accounts) {
    const record = parseContributorRecord(account.data);
    if (!record.distributed && record.totalAllocatedClwdn > 0n) {
      undistributed.push({ pda: pubkey, ...record });
    }
  }
  return undistributed;
}

async function distributeToContributor(record) {
  const contributionId = `bootstrap-${record.contributor.toBase58().slice(0, 16)}-${record.contributionCount}`;
  const amount = record.totalAllocatedClwdn;

  console.log(`\n  Distributing ${Number(amount) / 1e9} CLWDN to ${record.contributor.toBase58()}`);
  console.log(`  Contribution ID: ${contributionId}`);

  const recipientTA = await getOrCreateAssociatedTokenAccount(
    conn, authority, CLWDN_MINT, record.contributor, false, 'confirmed', undefined, TOKEN_PROGRAM_ID
  );
  console.log(`  Recipient token account: ${recipientTA.address.toBase58()}`);

  const [distPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('dist'), Buffer.from(contributionId)], DISPENSER_PROGRAM
  );
  console.log(`  Distribution PDA: ${distPda.toBase58()}`);

  const existingDist = await conn.getAccountInfo(distPda);
  let needsQueue = true;
  let needsDistribute = true;

  if (existingDist) {
    const statusOffset = 8 + 4 + 64 + 32 + 8;
    const status = existingDist.data[statusOffset];
    console.log(`  Distribution PDA already exists, status: ${status === 0 ? 'Queued' : status === 1 ? 'Distributed' : 'Cancelled'}`);

    if (status === 1) {
      needsQueue = false;
      needsDistribute = false;
    } else if (status === 0) {
      needsQueue = false;
    }
  }

  const contribIdBytes = Buffer.from(contributionId, 'utf8');
  const vault = await getOrCreateVault();
  const sigs = [];

  try {
    if (needsQueue) {
      console.log('  Step 1: Queuing distribution...');
      const addDisc = anchorDisc('add_recipient');
      const addData = Buffer.alloc(8 + 4 + contribIdBytes.length + 8);
      addDisc.copy(addData, 0);
      addData.writeUInt32LE(contribIdBytes.length, 8);
      contribIdBytes.copy(addData, 12);
      addData.writeBigUInt64LE(amount, 12 + contribIdBytes.length);

      const addIx = new TransactionInstruction({
        programId: DISPENSER_PROGRAM,
        keys: [
          { pubkey: DISPENSER_STATE, isSigner: false, isWritable: true },
          { pubkey: distPda, isSigner: false, isWritable: true },
          { pubkey: record.contributor, isSigner: false, isWritable: false },
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: addData,
      });

      const tx1 = new Transaction().add(addIx);
      const sig1 = await sendAndConfirmTransaction(conn, tx1, [authority]);
      console.log(`  ✅ Queued: ${sig1}`);
      console.log(`     Explorer: https://explorer.solana.com/tx/${sig1}?cluster=devnet`);
      sigs.push(sig1);

      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.log('  Step 1: Skipped (already queued)');
    }

    if (needsDistribute) {
      console.log('  Step 2: Executing distribution...');
      const distDisc = anchorDisc('distribute');
      const distData = Buffer.alloc(8 + 4 + contribIdBytes.length);
      distDisc.copy(distData, 0);
      distData.writeUInt32LE(contribIdBytes.length, 8);
      contribIdBytes.copy(distData, 12);

      const distIx = new TransactionInstruction({
        programId: DISPENSER_PROGRAM,
        keys: [
          { pubkey: DISPENSER_STATE, isSigner: false, isWritable: true },
          { pubkey: distPda, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: recipientTA.address, isSigner: false, isWritable: true },
          { pubkey: CLWDN_MINT, isSigner: false, isWritable: false },
          { pubkey: authority.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: distData,
      });

      const tx2 = new Transaction().add(distIx);
      const sig2 = await sendAndConfirmTransaction(conn, tx2, [authority]);
      console.log(`  ✅ Distributed: ${sig2}`);
      console.log(`     Explorer: https://explorer.solana.com/tx/${sig2}?cluster=devnet`);
      sigs.push(sig2);
    } else {
      console.log('  Step 2: Skipped (already distributed)');
    }

    console.log('  Step 3: Marking as distributed on bootstrap...');
    const markDisc = anchorDisc('mark_distributed');
    const markIx = new TransactionInstruction({
      programId: BOOTSTRAP_PROGRAM,
      keys: [
        { pubkey: BOOTSTRAP_STATE, isSigner: false, isWritable: false },
        { pubkey: record.pda, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      ],
      data: markDisc,
    });

    const tx3 = new Transaction().add(markIx);
    const sig3 = await sendAndConfirmTransaction(conn, tx3, [authority]);
    console.log(`  ✅ Marked: ${sig3}`);
    console.log(`     Explorer: https://explorer.solana.com/tx/${sig3}?cluster=devnet`);
    sigs.push(sig3);

    console.log(`  ✅ Distribution complete for ${record.contributor.toBase58()}`);
    return { success: true, sigs };
  } catch (e) {
    console.error(`  ❌ Error: ${e.message}`);
    if (e.logs) console.error('  Logs:', e.logs);
    return { success: false, error: e.message, sigs };
  }
}

async function runService() {
  console.log('🔴 Dispenser Service Starting (Local Mode)');
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  Dispenser:', DISPENSER_PROGRAM.toBase58());
  console.log('  Bootstrap:', BOOTSTRAP_PROGRAM.toBase58());
  console.log('  CLWDN Mint:', CLWDN_MINT.toBase58());

  await getOrCreateVault();

  const POLL_INTERVAL = parseInt(process.env.DISPENSER_POLL_INTERVAL || '15000');

  async function poll() {
    try {
      const undistributed = await findUndistributedContributions();
      if (undistributed.length > 0) {
        console.log(`\n📦 Found ${undistributed.length} undistributed contributions`);
        for (const record of undistributed) {
          await distributeToContributor(record);
        }
      }
    } catch (e) {
      console.error('Poll error:', e.message);
    }
  }

  await poll();
  setInterval(poll, POLL_INTERVAL);
  console.log(`\n✅ Dispenser service running (polling every ${POLL_INTERVAL/1000}s)`);
}

if (require.main === module) {
  runService().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { findUndistributedContributions, distributeToContributor };
