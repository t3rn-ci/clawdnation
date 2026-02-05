const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { serialize } = require('borsh');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));
const MINT = new PublicKey('HL4H8T26DcrXu695K2vuvYj1Qi1B664nF1nHfvG52yG5');
const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Derive metadata PDA
const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), MINT.toBuffer()],
  TOKEN_METADATA_PROGRAM
);

// Build CreateMetadataAccountV3 instruction data manually
// Discriminator: 33 for CreateMetadataAccountV3
function encodeString(s) {
  const buf = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length);
  return Buffer.concat([len, buf]);
}

const data = Buffer.concat([
  Buffer.from([33]),  // CreateMetadataAccountV3 discriminator
  // DataV2:
  encodeString('ClawdNation'),        // name
  encodeString('CLWDN'),              // symbol
  encodeString('https://clawdnation.com/metadata.json'), // uri
  Buffer.from([0, 0]),                // seller_fee_basis_points (u16)
  Buffer.from([0]),                    // creators: Option::None
  Buffer.from([0]),                    // collection: Option::None
  Buffer.from([0]),                    // uses: Option::None
  // is_mutable
  Buffer.from([1]),
  // collection_details: Option::None
  Buffer.from([0]),
]);

const ix = new TransactionInstruction({
  programId: TOKEN_METADATA_PROGRAM,
  keys: [
    { pubkey: metadataPda, isSigner: false, isWritable: true },     // metadata
    { pubkey: MINT, isSigner: false, isWritable: false },            // mint
    { pubkey: authority.publicKey, isSigner: true, isWritable: false }, // mint authority
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },  // payer
    { pubkey: authority.publicKey, isSigner: false, isWritable: false }, // update authority
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('Sysvar1nstructions1111111111111111111111111'), isSigner: false, isWritable: false },
  ],
  data: data,
});

(async () => {
  console.log('Metadata PDA:', metadataPda.toBase58());
  console.log('Mint:', MINT.toBase58());
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('Metadata created:', sig);
})().catch(e => {
  console.error('ERROR:', e.message?.slice(0, 500) || e);
  if (e.logs) console.error('Logs:', e.logs);
});
