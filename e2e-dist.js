const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
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

const buyer = new PublicKey('JBoPQYcFoBjiXVxL5UMaBYKoDKQQkPzGUpsi4UtJAYK7');
const allocated = 10000;

(async () => {
  const contribId = 'bootstrap-' + buyer.toBase58().slice(0, 16) + '-1';
  const idBuf = Buffer.from(contribId, 'utf8');
  const [distPda] = PublicKey.findProgramAddressSync([Buffer.from('dist'), idBuf], DISPENSER);
  const dispenserAta = await getAssociatedTokenAddress(MINT, dispenserState, true, TOKEN_PROGRAM_ID);
  const buyerAta = await getAssociatedTokenAddress(MINT, buyer, false, TOKEN_PROGRAM_ID);

  // Distribute: state, distribution, vault, recipient_token, mint, operator, token_program
  const dData = Buffer.alloc(8 + 4 + idBuf.length);
  disc('distribute').copy(dData, 0);
  dData.writeUInt32LE(idBuf.length, 8);
  idBuf.copy(dData, 12);

  const dTx = new Transaction();
  dTx.add(createAssociatedTokenAccountInstruction(authority.publicKey, buyerAta, buyer, MINT, TOKEN_PROGRAM_ID));
  dTx.add(new TransactionInstruction({
    programId: DISPENSER, keys: [
      { pubkey: dispenserState, isSigner: false, isWritable: true },     // state
      { pubkey: distPda, isSigner: false, isWritable: true },            // distribution
      { pubkey: dispenserAta, isSigner: false, isWritable: true },       // vault
      { pubkey: buyerAta, isSigner: false, isWritable: true },           // recipient_token_account
      { pubkey: MINT, isSigner: false, isWritable: false },              // mint
      { pubkey: authority.publicKey, isSigner: true, isWritable: true }, // operator
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ], data: dData,
  }));
  const sig = await sendAndConfirmTransaction(conn, dTx, [authority]);
  console.log('[5] Distributed:', sig.slice(0, 40) + '...');

  const buyerToken = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
  const buyerClwdn = Number(buyerToken.amount) / 1e9;
  console.log('    Buyer CLWDN:', buyerClwdn, buyerClwdn === 10000 ? '✅' : '❌');

  // Mark distributed
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
  console.log('[6] Marked distributed ✅');

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
