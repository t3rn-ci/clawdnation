const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const BOOTSTRAP = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');
const DISPENSER = new PublicKey('B25uk3KvnZxWJ1Ji1XLdtYq4gSmMsev8RPS1e8tjaNQk');
const MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');

const LP = new PublicKey('3Y3g183jbpyj1Nq9eDTfegGLMhgMXTBMviBus92Pp7rk');
const TREASURY = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');
const STAKING = new PublicKey('BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8');

const [bootstrapState] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP);
const [dispenserState] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);

function disc(name) { return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8); }
async function bal(addr) { return (await conn.getBalance(addr)) / LAMPORTS_PER_SOL; }

(async () => {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  E2E: BOOTSTRAP + DISPENSER FULL TEST     ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  // Fresh buyer
  const buyer = Keypair.generate();
  console.log('Buyer:', buyer.publicKey.toBase58());

  // Fund buyer
  console.log('\n[1] Fund buyer with 1.5 SOL...');
  const fundTx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey, toPubkey: buyer.publicKey, lamports: 1.5 * LAMPORTS_PER_SOL,
  }));
  await sendAndConfirmTransaction(conn, fundTx, [authority]);
  console.log('    ✅ Funded');

  // Record balances BEFORE
  console.log('\n[2] Balances BEFORE contribution:');
  const lpB = await bal(LP);
  const treasuryB = await bal(TREASURY);
  const stakingB = await bal(STAKING);
  console.log('    LP:       ' + lpB.toFixed(9) + ' SOL');
  console.log('    Treasury: ' + treasuryB.toFixed(9) + ' SOL');
  console.log('    Staking:  ' + stakingB.toFixed(9) + ' SOL');

  // Contribute 1 SOL
  console.log('\n[3] Contributing 1 SOL to bootstrap...');
  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), buyer.publicKey.toBuffer()], BOOTSTRAP
  );

  const cData = Buffer.alloc(16);
  disc('contribute_sol').copy(cData, 0);
  cData.writeBigUInt64LE(BigInt(LAMPORTS_PER_SOL), 8);

  const cIx = new TransactionInstruction({
    programId: BOOTSTRAP,
    keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: true },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: LP, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
      { pubkey: STAKING, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: cData,
  });

  const tx3 = new Transaction().add(cIx);
  const sig3 = await sendAndConfirmTransaction(conn, tx3, [buyer]);
  console.log('    TX:', sig3);

  // Read allocation from contributor PDA
  const rec = await conn.getAccountInfo(contributorPda);
  const rd = rec.data;
  const allocated = Number(rd.readBigUInt64LE(8 + 32 + 8)) / 1e9;
  console.log('    Allocated:', allocated, 'CLWDN');

  // Balances AFTER
  console.log('\n[4] Balances AFTER — verify 80/10/10 split:');
  const lpA = await bal(LP);
  const treasuryA = await bal(TREASURY);
  const stakingA = await bal(STAKING);

  const lpD = +(lpA - lpB).toFixed(9);
  const treasuryD = +(treasuryA - treasuryB).toFixed(9);
  const stakingD = +(stakingA - stakingB).toFixed(9);

  console.log('    LP:       +' + lpD + ' SOL (expect 0.8)  ' + (lpD === 0.8 ? '✅' : '❌'));
  console.log('    Treasury: +' + treasuryD + ' SOL (expect 0.1)  ' + (treasuryD === 0.1 ? '✅' : '❌'));
  console.log('    Staking:  +' + stakingD + ' SOL (expect 0.1)  ' + (stakingD === 0.1 ? '✅' : '❌'));
  console.log('    Total:    +' + (lpD + treasuryD + stakingD).toFixed(1) + ' SOL');

  // Dispenser distribution
  console.log('\n[5] Dispenser: queue + distribute CLWDN to buyer...');
  const contribId = 'bootstrap-' + buyer.publicKey.toBase58().slice(0, 16) + '-1';
  const idBuf = Buffer.from(contribId, 'utf8');
  const [distPda] = PublicKey.findProgramAddressSync([Buffer.from('dist'), idBuf], DISPENSER);

  // Queue
  const qData = Buffer.alloc(8 + 4 + idBuf.length + 8);
  disc('add_recipient').copy(qData, 0);
  qData.writeUInt32LE(idBuf.length, 8);
  idBuf.copy(qData, 12);
  qData.writeBigUInt64LE(BigInt(allocated * 1e9), 12 + idBuf.length);

  const qIx = new TransactionInstruction({
    programId: DISPENSER, keys: [
      { pubkey: dispenserState, isSigner: false, isWritable: true },
      { pubkey: distPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], data: qData,
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(qIx), [authority]);
  console.log('    Queued');

  // Distribute
  const dData = Buffer.alloc(8 + 4 + idBuf.length);
  disc('distribute').copy(dData, 0);
  dData.writeUInt32LE(idBuf.length, 8);
  idBuf.copy(dData, 12);

  const dispenserAta = await getAssociatedTokenAddress(MINT, dispenserState, true, TOKEN_PROGRAM_ID);
  const buyerAta = await getAssociatedTokenAddress(MINT, buyer.publicKey, false, TOKEN_PROGRAM_ID);

  const dTx = new Transaction();
  dTx.add(createAssociatedTokenAccountInstruction(authority.publicKey, buyerAta, buyer.publicKey, MINT, TOKEN_PROGRAM_ID));
  dTx.add(new TransactionInstruction({
    programId: DISPENSER, keys: [
      { pubkey: dispenserState, isSigner: false, isWritable: true },
      { pubkey: distPda, isSigner: false, isWritable: true },
      { pubkey: dispenserAta, isSigner: false, isWritable: true },
      { pubkey: buyerAta, isSigner: false, isWritable: true },
      { pubkey: buyer.publicKey, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ], data: dData,
  }));
  await sendAndConfirmTransaction(conn, dTx, [authority]);
  console.log('    Distributed');

  const buyerToken = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
  const buyerClwdn = Number(buyerToken.amount) / 1e9;
  console.log('    Buyer CLWDN:', buyerClwdn, buyerClwdn === 10000 ? '✅' : '❌');

  // Mark distributed on bootstrap
  console.log('\n[6] Mark distributed on bootstrap...');
  const mData = disc('mark_distributed');
  const mIx = new TransactionInstruction({
    programId: BOOTSTRAP, keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: false },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ], data: mData,
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(mIx), [authority]);
  console.log('    ✅ Marked');

  // Final summary
  const solOk = lpD === 0.8 && treasuryD === 0.1 && stakingD === 0.1;
  const rateOk = allocated === 10000;
  const distOk = buyerClwdn === 10000;

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║            E2E RESULTS                     ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  SOL split 80/10/10:    ' + (solOk ? '✅ PASS' : '❌ FAIL') + '              ║');
  console.log('║  Rate 10k CLWDN/SOL:    ' + (rateOk ? '✅ PASS' : '❌ FAIL') + '              ║');
  console.log('║  CLWDN distribution:    ' + (distOk ? '✅ PASS' : '❌ FAIL') + '              ║');
  console.log('║  Overall:               ' + (solOk && rateOk && distOk ? '✅ ALL PASS' : '❌ FAILURES') + '           ║');
  console.log('╚═══════════════════════════════════════════╝');
})().catch(e => console.error('ERROR:', e.message || e));
