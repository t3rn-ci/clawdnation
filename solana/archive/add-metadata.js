/**
 * Add Metaplex metadata to CLWDN token
 */
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsKeypair, fromWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { createSignerFromKeypair, percentAmount, publicKey } = require('@metaplex-foundation/umi');
const { Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

const NETWORK = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || '/root/.config/solana/clawdnation.json';
const TOKEN_MINT = process.env.TOKEN_MINT || '2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx';

async function main() {
  // Load keypair
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log('Wallet:', keypair.publicKey.toBase58());

  // Create UMI instance
  const umi = createUmi(NETWORK);
  const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(keypair));
  umi.identity = signer;
  umi.payer = signer;

  const mintPubkey = publicKey(TOKEN_MINT);

  console.log('Adding metadata to token:', TOKEN_MINT);

  const tx = createMetadataAccountV3(umi, {
    mint: mintPubkey,
    mintAuthority: signer,
    payer: signer,
    updateAuthority: signer.publicKey,
    data: {
      name: 'ClawdNation',
      symbol: 'CLWDN',
      uri: 'https://clawdnation.com/token-metadata.json',
      sellerFeeBasisPoints: 0,
      creators: [{ address: signer.publicKey, verified: true, share: 100 }],
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  });

  const sig = await tx.sendAndConfirm(umi);
  console.log('✅ Metadata added!');
  console.log('Signature:', sig.signature);
}

main().catch(e => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
