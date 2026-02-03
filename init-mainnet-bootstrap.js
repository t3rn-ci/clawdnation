const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const BOOTSTRAP = new PublicKey('91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No');
const [bootstrapState] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP);

const LP_WALLET = new PublicKey('3Y3g183jbpyj1Nq9eDTfegGLMhgMXTBMviBus92Pp7rk');
const MASTER_WALLET = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');
const STAKING_WALLET = new PublicKey('BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8');

function anchorDisc(name) {
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

(async () => {
  // BootstrapParams: start_rate(u64) + end_rate(u64) + allocation_cap(u64) + min_contribution(u64) + max_per_wallet(u64)
  const params = Buffer.alloc(40);
  params.writeBigUInt64LE(10000n, 0);           // start_rate: 10,000 CLWDN/SOL
  params.writeBigUInt64LE(10000n, 8);           // end_rate: 10,000 (flat rate for now)
  params.writeBigUInt64LE(100000000n, 16);      // allocation_cap: 100M CLWDN (in tokens, not lamports)
  params.writeBigUInt64LE(10000000n, 24);       // min_contribution: 0.01 SOL (10M lamports)
  params.writeBigUInt64LE(100000000000n, 32);   // max_per_wallet: 100 SOL

  const data = Buffer.concat([anchorDisc('initialize'), params]);

  const ix = new TransactionInstruction({
    programId: BOOTSTRAP,
    keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: true },
      { pubkey: LP_WALLET, isSigner: false, isWritable: true },
      { pubkey: MASTER_WALLET, isSigner: false, isWritable: true },
      { pubkey: STAKING_WALLET, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data,
  });

  console.log('Initializing bootstrap on mainnet...');
  console.log('Program:', BOOTSTRAP.toBase58());
  console.log('LP wallet:', LP_WALLET.toBase58(), '(80%)');
  console.log('Master wallet:', MASTER_WALLET.toBase58(), '(10%)');
  console.log('Staking wallet:', STAKING_WALLET.toBase58(), '(10%)');
  console.log('Rate: 10,000 CLWDN/SOL (flat)');

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('\n✅ Bootstrap initialized:', sig);
  
  const info = await conn.getAccountInfo(bootstrapState);
  console.log('State PDA:', bootstrapState.toBase58(), '(size:', info.data.length, ')');
})().catch(e => {
  console.error('ERROR:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs);
});
