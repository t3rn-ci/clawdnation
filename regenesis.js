const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createInitializeMintInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMinimumBalanceForRentExemptMint,
        getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction,
        createTransferInstruction, createSetAuthorityInstruction, AuthorityType } = require('@solana/spl-token');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));
const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function encodeString(s) {
  const buf = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length);
  return Buffer.concat([len, buf]);
}

// Wallets
const LP = new PublicKey('3Y3g183jbpyj1Nq9eDTfegGLMhgMXTBMviBus92Pp7rk');
const STAKING = new PublicKey('BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8');
const TEAM = new PublicKey('3DAZTJRxzyLkqzvqiqYZrUcAmM2CHKG7VJe69Rb24iQQ');
const COMMUNITY = new PublicKey('2MT5NRrXB2ioGtnvtpUG3f8it99cCCpUf7SzaiJKeB3h');
const TREASURY = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');
const DISPENSER = new PublicKey('4QZsRrXgB9tVReBsPXUKKbKRk87mRT7ZuyqyvWy68QZN');
const [dispenserPda] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);

const allocations = [
  { name: 'LP', wallet: LP, amount: 400_000_000 },
  { name: 'Staking', wallet: STAKING, amount: 150_000_000 },
  { name: 'Team', wallet: TEAM, amount: 150_000_000 },
  { name: 'Community', wallet: COMMUNITY, amount: 100_000_000 },
  { name: 'Treasury', wallet: TREASURY, amount: 100_000_000 },
];

(async () => {
  // === STEP 1: Create mint ===
  const mintKeypair = Keypair.generate();
  const MINT = mintKeypair.publicKey;
  console.log('New CLWDN Mint:', MINT.toBase58());
  fs.writeFileSync('/root/.config/solana/clwdn-wallets/clwdn-mint.json', JSON.stringify(Array.from(mintKeypair.secretKey)));

  const rent = await getMinimumBalanceForRentExemptMint(conn);
  const tx1 = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: authority.publicKey, newAccountPubkey: MINT, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
    createInitializeMintInstruction(MINT, 9, authority.publicKey, null, TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, tx1, [authority, mintKeypair]);
  console.log('✅ Step 1: Mint created');

  // === STEP 2: Add Metaplex metadata (raw instruction) ===
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), MINT.toBuffer()],
    TOKEN_METADATA_PROGRAM
  );
  const metaData = Buffer.concat([
    Buffer.from([33]),
    encodeString('ClawdNation'),
    encodeString('CLWDN'),
    encodeString('https://clawdnation.com/metadata.json'),
    Buffer.from([0, 0]),  // seller_fee_basis_points
    Buffer.from([0]),     // creators: None
    Buffer.from([0]),     // collection: None
    Buffer.from([0]),     // uses: None
    Buffer.from([1]),     // is_mutable
    Buffer.from([0]),     // collection_details: None
  ]);
  const tx2 = new Transaction().add({
    programId: TOKEN_METADATA_PROGRAM,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('Sysvar1nstructions1111111111111111111111111'), isSigner: false, isWritable: false },
    ],
    data: metaData,
  });
  await sendAndConfirmTransaction(conn, tx2, [authority]);
  console.log('✅ Step 2: Metadata added (ClawdNation / CLWDN)');

  // === STEP 3: Mint 1B supply ===
  const authorityAta = await getAssociatedTokenAddress(MINT, authority.publicKey, false, TOKEN_PROGRAM_ID);
  const tx3 = new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, authorityAta, authority.publicKey, MINT, TOKEN_PROGRAM_ID),
    createMintToInstruction(MINT, authorityAta, authority.publicKey, BigInt(1_000_000_000 * 1e9), [], TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, tx3, [authority]);
  console.log('✅ Step 3: Minted 1,000,000,000 CLWDN');

  // === STEP 4: Distribute ===
  for (const alloc of allocations) {
    const destAta = await getAssociatedTokenAddress(MINT, alloc.wallet, false, TOKEN_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(authority.publicKey, destAta, alloc.wallet, MINT, TOKEN_PROGRAM_ID),
      createTransferInstruction(authorityAta, destAta, authority.publicKey, BigInt(alloc.amount) * BigInt(1e9), [], TOKEN_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(conn, tx, [authority]);
    console.log('  ' + alloc.name + ': ' + (alloc.amount/1e6) + 'M');
  }

  // Dispenser vault (100M)
  const dispenserAta = await getAssociatedTokenAddress(MINT, dispenserPda, true, TOKEN_PROGRAM_ID);
  const txD = new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, dispenserAta, dispenserPda, MINT, TOKEN_PROGRAM_ID),
    createTransferInstruction(authorityAta, dispenserAta, authority.publicKey, BigInt(100_000_000) * BigInt(1e9), [], TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, txD, [authority]);
  console.log('  Dispenser vault: 100M');
  console.log('✅ Step 4: All allocations distributed');

  // === STEP 5: Revoke mint authority ===
  const tx5 = new Transaction().add(
    createSetAuthorityInstruction(MINT, authority.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, tx5, [authority]);
  console.log('✅ Step 5: Mint authority revoked');

  // Verify
  const { getMint, getAccount } = require('@solana/spl-token');
  const mintInfo = await getMint(conn, MINT, 'confirmed', TOKEN_PROGRAM_ID);
  console.log('\n=== CLWDN RE-GENESIS COMPLETE ===');
  console.log('Mint:', MINT.toBase58());
  console.log('Supply:', (Number(mintInfo.supply) / 1e9).toLocaleString());
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58() || 'REVOKED ✅');
  console.log('Metadata: ClawdNation / CLWDN ✅');
  console.log('\nNext: update dispenser + bootstrap programs with new mint address');
})().catch(e => {
  console.error('ERROR:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs);
});
