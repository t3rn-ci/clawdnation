const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const BOOTSTRAP = new PublicKey('91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No');
const [bootstrapState, bump] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP);

const LP_WALLET = new PublicKey('3Y3g183jbpyj1Nq9eDTfegGLMhgMXTBMviBus92Pp7rk');
const MASTER_WALLET = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');
const STAKING_WALLET = new PublicKey('BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8');

function anchorDisc(name) {
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

(async () => {
  // Step 1: Close existing state
  console.log('Step 1: Closing bootstrap state...');
  const closeDisc = anchorDisc('close_state');
  const closeIx = new TransactionInstruction({
    programId: BOOTSTRAP,
    keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    ],
    data: closeDisc,
  });
  const closeTx = new Transaction().add(closeIx);
  const closeSig = await sendAndConfirmTransaction(conn, closeTx, [authority]);
  console.log('  ✅ Closed:', closeSig.slice(0, 40) + '...');

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Reinitialize with correct decimal-adjusted params
  console.log('\nStep 2: Reinitializing with decimal-adjusted rates...');
  
  // Rate: 10,000 CLWDN per SOL. With 9 decimals, that's 10_000 * 1e9 = 10_000_000_000_000
  // Allocation cap: 100M CLWDN. With 9 decimals: 100_000_000 * 1e9 = 100_000_000_000_000_000
  // Min contribution: 0.01 SOL = 10_000_000 lamports
  // Max per wallet: 100 SOL = 100_000_000_000 lamports
  
  const params = Buffer.alloc(40);
  const start_rate = BigInt(10_000) * BigInt(1e9);    // 10,000 CLWDN (with decimals) per SOL
  const end_rate = BigInt(10_000) * BigInt(1e9);       // flat rate
  const alloc_cap = BigInt(100_000_000) * BigInt(1e9); // 100M CLWDN with decimals
  const min_contrib = BigInt(10_000_000);               // 0.01 SOL
  const max_wallet = BigInt(100_000_000_000);           // 100 SOL
  
  params.writeBigUInt64LE(start_rate, 0);
  params.writeBigUInt64LE(end_rate, 8);
  params.writeBigUInt64LE(alloc_cap, 16);
  params.writeBigUInt64LE(min_contrib, 24);
  params.writeBigUInt64LE(max_wallet, 32);
  
  console.log('  start_rate:', start_rate.toString(), '(10K CLWDN/SOL with 9 decimals)');
  console.log('  end_rate:', end_rate.toString());
  console.log('  allocation_cap:', alloc_cap.toString(), '(100M CLWDN with 9 decimals)');

  const initDisc = anchorDisc('initialize');
  const initData = Buffer.concat([initDisc, params]);
  
  const initIx = new TransactionInstruction({
    programId: BOOTSTRAP,
    keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: true },
      { pubkey: LP_WALLET, isSigner: false, isWritable: true },
      { pubkey: MASTER_WALLET, isSigner: false, isWritable: true },
      { pubkey: STAKING_WALLET, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initData,
  });
  
  const initTx = new Transaction().add(initIx);
  const initSig = await sendAndConfirmTransaction(conn, initTx, [authority]);
  console.log('  ✅ Reinitialized:', initSig.slice(0, 40) + '...');

  // Verify
  const info = await conn.getAccountInfo(bootstrapState);
  const d = info.data;
  let off = 8 + 32 + 1 + 32 + 32 + 32; // disc + authority + option(None) + lp + master + staking
  const sr = Number(d.readBigUInt64LE(off)); off += 8;
  const er = Number(d.readBigUInt64LE(off)); off += 8;
  const ac = Number(d.readBigUInt64LE(off)); off += 8;
  console.log('\nVerification:');
  console.log('  start_rate:', sr, '-> CLWDN/SOL:', sr / 1e9);
  console.log('  end_rate:', er, '-> CLWDN/SOL:', er / 1e9);
  console.log('  allocation_cap:', ac, '-> CLWDN:', ac / 1e9);
  
  console.log('\n✅ Bootstrap rate fix complete. 0.01 SOL should now give 100 CLWDN.');
})().catch(e => {
  console.error('ERROR:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs);
});
