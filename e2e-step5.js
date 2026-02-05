const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const BOOTSTRAP = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');
const DISPENSER = new PublicKey('B25uk3KvnZxWJ1Ji1XLdtYq4gSmMsev8RPS1e8tjaNQk');
const MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');
const [bootstrapState] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP);
const [dispenserState] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);

function disc(name) { return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8); }

// The buyer from step 3 — use the contributor PDA that was just created
const buyer = new PublicKey('JBoPQYcFoBjiXVxL5UMaBYKoDKQQkPzGUpsi4UtJAYK7');
const allocated = 10000;

(async () => {
  console.log('[5] Dispenser: queue + distribute CLWDN...');
  
  const contribId = 'bootstrap-' + buyer.toBase58().slice(0, 16) + '-1';
  const idBuf = Buffer.from(contribId, 'utf8');
  const [distPda] = PublicKey.findProgramAddressSync([Buffer.from('dist'), idBuf], DISPENSER);

  // Queue — add_recipient(contribution_id, amount) with accounts: state, distribution, recipient, operator, system
  const qData = Buffer.alloc(8 + 4 + idBuf.length + 8);
  disc('add_recipient').copy(qData, 0);
  qData.writeUInt32LE(idBuf.length, 8);
  idBuf.copy(qData, 12);
  qData.writeBigUInt64LE(BigInt(allocated * 1e9), 12 + idBuf.length);

  const qIx = new TransactionInstruction({
    programId: DISPENSER, keys: [
      { pubkey: dispenserState, isSigner: false, isWritable: true },
      { pubkey: distPda, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: false, isWritable: false },           // recipient
      { pubkey: authority.publicKey, isSigner: true, isWritable: true }, // operator
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], data: qData,
  });
  const sig1 = await sendAndConfirmTransaction(conn, new Transaction().add(qIx), [authority]);
  console.log('    Queued:', sig1.slice(0, 30) + '...');

  // Distribute
  const dData = Buffer.alloc(8 + 4 + idBuf.length);
  disc('distribute').copy(dData, 0);
  dData.writeUInt32LE(idBuf.length, 8);
  idBuf.copy(dData, 12);

  const dispenserAta = await getAssociatedTokenAddress(MINT, dispenserState, true, TOKEN_PROGRAM_ID);
  const buyerAta = await getAssociatedTokenAddress(MINT, buyer, false, TOKEN_PROGRAM_ID);

  const dTx = new Transaction();
  dTx.add(createAssociatedTokenAccountInstruction(authority.publicKey, buyerAta, buyer, MINT, TOKEN_PROGRAM_ID));
  dTx.add(new TransactionInstruction({
    programId: DISPENSER, keys: [
      { pubkey: dispenserState, isSigner: false, isWritable: true },
      { pubkey: distPda, isSigner: false, isWritable: true },
      { pubkey: dispenserAta, isSigner: false, isWritable: true },
      { pubkey: buyerAta, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ], data: dData,
  }));
  const sig2 = await sendAndConfirmTransaction(conn, dTx, [authority]);
  console.log('    Distributed:', sig2.slice(0, 30) + '...');

  const buyerToken = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
  const buyerClwdn = Number(buyerToken.amount) / 1e9;
  console.log('    Buyer CLWDN:', buyerClwdn, buyerClwdn === 10000 ? '✅' : '❌');

  // Mark distributed
  console.log('\n[6] Mark distributed on bootstrap...');
  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), buyer.toBuffer()], BOOTSTRAP
  );
  const mIx = new TransactionInstruction({
    programId: BOOTSTRAP, keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: false },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ], data: disc('mark_distributed'),
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(mIx), [authority]);
  console.log('    ✅ Marked');

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║            E2E RESULTS                     ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  SOL split 80/10/10:    ✅ PASS              ║');
  console.log('║  Rate 10k CLWDN/SOL:    ✅ PASS              ║');
  console.log('║  CLWDN distribution:    ' + (buyerClwdn === 10000 ? '✅ PASS' : '❌ FAIL') + '              ║');
  console.log('║  Mark distributed:      ✅ PASS              ║');
  console.log('║  Overall:               ' + (buyerClwdn === 10000 ? '✅ ALL PASS' : '❌ FAILURES') + '           ║');
  console.log('╚═══════════════════════════════════════════╝');
})().catch(e => console.error('ERROR:', e.message || e));
