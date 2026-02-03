const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createInitializeMintInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMinimumBalanceForRentExemptMint } = require('@solana/spl-token');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsKeypair, fromWeb3JsPublicKey, toWeb3JsTransaction } = require('@metaplex-foundation/umi-web3js-adapters');
const { createSignerFromKeypair } = require('@metaplex-foundation/umi');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

(async () => {
  // Step 1: Create mint
  const mintKeypair = Keypair.generate();
  console.log('New CLWDN Mint:', mintKeypair.publicKey.toBase58());
  
  // Save mint keypair for reference
  fs.writeFileSync('/root/.config/solana/clwdn-wallets/clwdn-mint.json', JSON.stringify(Array.from(mintKeypair.secretKey)));

  const rent = await getMinimumBalanceForRentExemptMint(conn);
  const tx1 = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintKeypair.publicKey, 9, authority.publicKey, null, TOKEN_PROGRAM_ID)
  );
  
  const sig1 = await sendAndConfirmTransaction(conn, tx1, [authority, mintKeypair]);
  console.log('Mint created:', sig1.slice(0, 30) + '...');

  // Step 2: Add Metaplex metadata
  console.log('Adding metadata...');
  const umi = createUmi('https://api.devnet.solana.com');
  const umiKeypair = fromWeb3JsKeypair(authority);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.identity = signer;
  umi.payer = signer;

  const metaTx = createMetadataAccountV3(umi, {
    mint: fromWeb3JsPublicKey(mintKeypair.publicKey),
    mintAuthority: signer,
    payer: signer,
    updateAuthority: umiKeypair.publicKey,
    data: {
      name: 'ClawdNation',
      symbol: 'CLWDN',
      uri: 'https://clawdnation.com/metadata.json',
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  });

  const sig2 = await metaTx.sendAndConfirm(umi);
  console.log('Metadata added:', Buffer.from(sig2.signature).toString('base64').slice(0, 30) + '...');

  // Step 3: Create token account and mint 1B
  const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, createMintToInstruction } = require('@solana/spl-token');
  const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, authority.publicKey, false, TOKEN_PROGRAM_ID);
  
  const tx3 = new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, ata, authority.publicKey, mintKeypair.publicKey, TOKEN_PROGRAM_ID),
    createMintToInstruction(mintKeypair.publicKey, ata, authority.publicKey, BigInt(1000000000 * 1e9), [], TOKEN_PROGRAM_ID)
  );
  const sig3 = await sendAndConfirmTransaction(conn, tx3, [authority]);
  console.log('Minted 1B:', sig3.slice(0, 30) + '...');

  console.log('\n✅ Mint:', mintKeypair.publicKey.toBase58());
  console.log('✅ Supply: 1,000,000,000');
  console.log('✅ Metadata: ClawdNation / CLWDN');
  console.log('✅ Mint authority: still active (will revoke after distribution)');
  console.log('\nDO NOT revoke mint authority until all allocations are done!');
})().catch(e => console.error('ERROR:', e.message || e));
