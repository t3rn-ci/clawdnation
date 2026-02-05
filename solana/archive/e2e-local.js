#!/usr/bin/env node
/**
 * E2E Test (Local) — Full Bootstrap → Dispenser flow
 * Modified to use local keypair and handle authority constraints
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

// Use local keypair
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
console.log('Loading keypair from:', KEYPAIR_PATH);

if (!fs.existsSync(KEYPAIR_PATH)) {
  console.error('❌ Keypair not found at:', KEYPAIR_PATH);
  console.error('Run: solana-keygen new');
  process.exit(1);
}

const authorityKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const CLWDN_MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');
const BOOTSTRAP_PROGRAM = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');
const DISPENSER_PROGRAM = new PublicKey('fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi');
const [BOOTSTRAP_STATE] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
const [DISPENSER_STATE] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

const ACTUAL_TREASURY = 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE'; // Hardcoded in bootstrap state

const EX = 'https://explorer.solana.com';

function anchorDisc(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

function txLink(sig) { return `${EX}/tx/${sig}?cluster=devnet`; }
function addrLink(addr) { return `${EX}/address/${addr}?cluster=devnet`; }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const results = { txs: {}, accounts: {}, steps: [] };

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     CLWDN E2E TEST — Full Bootstrap → Dispense  ║');
  console.log('║                  (Local Mode)                    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('Local Authority:', authority.publicKey.toBase58());
  console.log('Actual Treasury:', ACTUAL_TREASURY);

  if (authority.publicKey.toBase58() !== ACTUAL_TREASURY) {
    console.log('\n⚠️  WARNING: Your keypair is NOT the bootstrap treasury!');
    console.log('   This test will FAIL at the contribution step.');
    console.log('   The bootstrap program only accepts the hardcoded treasury.\n');
    console.log('   However, let\'s proceed to show you the flow...\n');
  }

  const bal = await conn.getBalance(authority.publicKey);
  console.log('Balance:', bal / LAMPORTS_PER_SOL, 'SOL\n');

  // === STEP 0: Setup ===
  console.log('━━━ STEP 0: Setup ━━━');
  const buyer = Keypair.generate();
  console.log(`Buyer wallet: ${buyer.publicKey.toBase58()}`);
  console.log(`  Explorer: ${addrLink(buyer.publicKey.toBase58())}`);

  console.log('Funding buyer with 0.2 SOL...');
  const fundTx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey, toPubkey: buyer.publicKey, lamports: 0.2 * LAMPORTS_PER_SOL
  }));
  const fundSig = await sendAndConfirmTransaction(conn, fundTx, [authority]);

  const buyerBal = await conn.getBalance(buyer.publicKey);
  console.log(`✅ Fund TX: ${fundSig}`);
  console.log(`  Explorer: ${txLink(fundSig)}`);
  console.log(`Buyer SOL balance: ${buyerBal / LAMPORTS_PER_SOL}`);
  results.txs.fund = fundSig;
  results.accounts.buyer = buyer.publicKey.toBase58();
  console.log();

  // === STEP 1: X Post Intent (simulated) ===
  console.log('━━━ STEP 1: X Post Intent ━━━');
  console.log('Simulated tweet: "@clawdnation I want to buy $CLWDN!"');
  console.log('Bot replies: "Send SOL to our bootstrap program to get CLWDN at 1 SOL = 10,000 CLWDN"');
  console.log(`Bootstrap program: ${BOOTSTRAP_PROGRAM.toBase58()}`);
  console.log(`  Explorer: ${addrLink(BOOTSTRAP_PROGRAM.toBase58())}`);
  results.steps.push({ step: 1, status: '✅', desc: 'X post intent (simulated)' });
  console.log();

  // === STEP 2: Contribute SOL to Bootstrap ===
  console.log('━━━ STEP 2: Contribute SOL to Bootstrap ━━━');
  const contributionLamports = 0.1 * LAMPORTS_PER_SOL;
  const expectedClwdn = 1000;

  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), buyer.publicKey.toBuffer()], BOOTSTRAP_PROGRAM
  );
  console.log(`Contributor PDA: ${contributorPda.toBase58()}`);
  console.log(`  Explorer: ${addrLink(contributorPda.toBase58())}`);
  results.accounts.contributorPda = contributorPda.toBase58();

  const contribDisc = anchorDisc('contribute_sol');
  const contribData = Buffer.alloc(8 + 8);
  contribDisc.copy(contribData, 0);
  contribData.writeBigUInt64LE(BigInt(Math.round(contributionLamports)), 8);

  const contribIx = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: BOOTSTRAP_STATE, isSigner: false, isWritable: true },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(ACTUAL_TREASURY), isSigner: false, isWritable: true }, // Must be actual treasury
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: contribData,
  });

  try {
    const contribTx = new Transaction().add(contribIx);
    const contribSig = await sendAndConfirmTransaction(conn, contribTx, [buyer]);
    console.log(`✅ Contribution TX: ${contribSig}`);
    console.log(`  Explorer: ${txLink(contribSig)}`);
    console.log(`  Amount: 0.1 SOL → expected ${expectedClwdn} CLWDN`);
    results.txs.contribution = contribSig;

    // Verify contribution on-chain
    const contributorAcct = await conn.getAccountInfo(contributorPda);
    if (contributorAcct) {
      const data = contributorAcct.data;
      const totalLamports = data.readBigUInt64LE(40);
      const totalClwdn = data.readBigUInt64LE(48);
      const count = data.readBigUInt64LE(56);
      const distributed = data[72] === 1;
      console.log('  On-chain record:');
      console.log(`    Total contributed: ${Number(totalLamports) / LAMPORTS_PER_SOL} SOL`);
      console.log(`    Total allocated: ${Number(totalClwdn) / 1e9} CLWDN`);
      console.log(`    Contributions: ${Number(count)}`);
      console.log(`    Distributed: ${distributed}`);
    }

    results.steps.push({ step: 2, status: '✅', desc: 'Bootstrap contribution (0.1 SOL → 1000 CLWDN)', tx: contribSig });
    console.log();

    // === STEP 3: Wait for Dispenser ===
    console.log('━━━ STEP 3: Waiting for Dispenser Service ━━━');
    console.log('Dispenser polls every 15s. Waiting up to 60s...');
    console.log('💡 Make sure dispenser service is running: node solana/dispenser-service-local.js');

    const buyerAta = await getAssociatedTokenAddress(CLWDN_MINT, buyer.publicKey, false, TOKEN_PROGRAM_ID);
    console.log(`Buyer ATA: ${buyerAta.toBase58()}`);
    console.log(`  Explorer: ${addrLink(buyerAta.toBase58())}`);
    results.accounts.buyerAta = buyerAta.toBase58();

    let distributed = false;
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      process.stdout.write(`  ${(i+1)*5}s... `);

      try {
        const tokenAcct = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
        if (tokenAcct.amount > 0n) {
          console.log(`\n🎉 CLWDN received! Balance: ${Number(tokenAcct.amount) / 1e9} CLWDN`);
          distributed = true;
          break;
        }
      } catch {
        // Token account doesn't exist yet
      }

      const record = await conn.getAccountInfo(contributorPda);
      if (record && record.data[72] === 1) {
        console.log('\n✅ Marked as distributed on bootstrap!');
        distributed = true;
        await sleep(3000);
        try {
          const tokenAcct = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
          console.log(`  Buyer CLWDN balance: ${Number(tokenAcct.amount) / 1e9}`);
        } catch {
          console.log('  Token account not yet created (may need a moment)');
        }
        break;
      }
    }

    results.steps.push({ step: 3, status: distributed ? '✅' : '⏰', desc: 'Dispenser auto-distribution' });

    if (!distributed) {
      console.log('\n\n⏰ Timeout - dispenser service may not be running');
      console.log('   Start it with: node solana/dispenser-service-local.js');
    }
    console.log();

    // === STEP 4: Final Verification ===
    console.log('━━━ STEP 4: Final Verification ━━━');

    let finalClwdn = 0;
    try {
      const tokenAcct = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
      finalClwdn = Number(tokenAcct.amount) / 1e9;
      console.log(`${finalClwdn >= expectedClwdn ? '✅' : '❌'} Buyer CLWDN balance: ${finalClwdn} CLWDN (expected: ${expectedClwdn})`);
    } catch {
      console.log('⏰ Buyer has no CLWDN token account yet');
    }

    const finalRecord = await conn.getAccountInfo(contributorPda);
    if (finalRecord) {
      const isDist = finalRecord.data[72] === 1;
      console.log(`${isDist ? '✅' : '⏰'} Contributor record: ${isDist ? 'DISTRIBUTED' : 'PENDING'}`);
    }

    console.log('\n━━━ Test Summary ━━━');
    console.log('✅ Contribution recorded on-chain');
    console.log(distributed ? '✅ Distribution completed' : '⏰ Distribution pending (service not running)');
    console.log(`\nBuyer: ${buyer.publicKey.toBase58()}`);
    console.log(`Contribution TX: ${txLink(results.txs.contribution)}`);

  } catch (e) {
    console.error('\n❌ Contribution FAILED:', e.message);

    if (e.message.includes('InvalidTreasury') || e.message.includes('0x1775')) {
      console.error('\n💡 This is expected - your wallet is not the bootstrap treasury.');
      console.error('   The bootstrap program only accepts: ' + ACTUAL_TREASURY);
      console.error('\n   To test fully, you need:');
      console.error('   1. The treasury keypair, OR');
      console.error('   2. Deploy fresh programs with your wallet as treasury');
    }

    if (e.logs) {
      console.error('\nProgram Logs:');
      e.logs.forEach(log => console.error('  ', log));
    }

    results.steps.push({ step: 2, status: '❌', desc: 'Bootstrap contribution FAILED', error: e.message });
  }

  console.log('\n━━━ E2E Test Complete ━━━\n');

  // Save results
  fs.writeFileSync(
    path.join(__dirname, 'e2e-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('Results saved to: solana/e2e-results.json\n');
}

if (require.main === module) {
  main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
}

module.exports = { main };
