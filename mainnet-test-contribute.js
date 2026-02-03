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

// Contributor record PDA
const [contributorRecord] = PublicKey.findProgramAddressSync(
  [Buffer.from('contributor'), authority.publicKey.toBuffer()],
  BOOTSTRAP
);

function anchorDisc(name) {
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

const CONTRIBUTION_LAMPORTS = 10_000_000; // 0.01 SOL

(async () => {
  console.log('Testing mainnet bootstrap contribution...');
  console.log('Contributor:', authority.publicKey.toBase58());
  console.log('Amount: 0.01 SOL');
  console.log('Expected CLWDN: 100 (at 10,000 CLWDN/SOL)');

  const disc = anchorDisc('contribute_sol');
  const data = Buffer.alloc(8 + 8);
  disc.copy(data, 0);
  data.writeBigUInt64LE(BigInt(CONTRIBUTION_LAMPORTS), 8);

  const ix = new TransactionInstruction({
    programId: BOOTSTRAP,
    keys: [
      { pubkey: bootstrapState, isSigner: false, isWritable: true },
      { pubkey: contributorRecord, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: LP_WALLET, isSigner: false, isWritable: true },
      { pubkey: MASTER_WALLET, isSigner: false, isWritable: true },
      { pubkey: STAKING_WALLET, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('\n✅ Contribution tx:', sig);
  console.log('Explorer: https://explorer.solana.com/tx/' + sig);

  // Check contributor record
  const info = await conn.getAccountInfo(contributorRecord);
  if (info) {
    const d = info.data;
    const contributor = new PublicKey(d.slice(8, 40));
    const totalContributed = d.readBigUInt64LE(40);
    const totalAllocated = d.readBigUInt64LE(48);
    console.log('\nContributor:', contributor.toBase58());
    console.log('Total contributed:', Number(totalContributed) / 1e9, 'SOL');
    console.log('Total allocated:', Number(totalAllocated) / 1e9, 'CLWDN');
  }
})().catch(e => {
  console.error('ERROR:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs);
});
