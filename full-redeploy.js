const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createInitializeMintInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction, createTransferInstruction, createSetAuthorityInstruction, AuthorityType, getMint, getAccount } = require('@solana/spl-token');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const BOOTSTRAP = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');
const DISPENSER = new PublicKey('B25uk3KvnZxWJ1Ji1XLdtYq4gSmMsev8RPS1e8tjaNQk');
const [dispenserPda] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);
const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const LP = new PublicKey('3Y3g183jbpyj1Nq9eDTfegGLMhgMXTBMviBus92Pp7rk');
const STAKING = new PublicKey('BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8');
const TEAM = new PublicKey('3DAZTJRxzyLkqzvqiqYZrUcAmM2CHKG7VJe69Rb24iQQ');
const COMMUNITY = new PublicKey('2MT5NRrXB2ioGtnvtpUG3f8it99cCCpUf7SzaiJKeB3h');
const TREASURY = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');

function encodeString(s) {
  const buf = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length);
  return Buffer.concat([len, buf]);
}

(async () => {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  FULL CLWDN REDEPLOY (DEVNET)              ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  // 1. Create mint
  const mintKp = Keypair.generate();
  const MINT = mintKp.publicKey;
  console.log('[1] Creating mint:', MINT.toBase58());
  
  const rent = await getMinimumBalanceForRentExemptMint(conn);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: authority.publicKey, newAccountPubkey: MINT, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
    createInitializeMintInstruction(MINT, 9, authority.publicKey, null, TOKEN_PROGRAM_ID)
  ), [authority, mintKp]);
  console.log('    ✅ Mint created');

  // 2. Add metadata
  console.log('[2] Adding metadata (ClawdNation / CLWDN)...');
  const [metaPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), MINT.toBuffer()], TOKEN_METADATA_PROGRAM
  );
  const metaData = Buffer.concat([
    Buffer.from([33]), encodeString('ClawdNation'), encodeString('CLWDN'),
    encodeString('https://clawdnation.com/metadata.json'),
    Buffer.from([0, 0]), Buffer.from([0]), Buffer.from([0]), Buffer.from([0]),
    Buffer.from([1]), Buffer.from([0]),
  ]);
  await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM,
    keys: [
      { pubkey: metaPda, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('Sysvar1nstructions1111111111111111111111111'), isSigner: false, isWritable: false },
    ],
    data: metaData,
  })), [authority]);
  console.log('    ✅ Metadata added');

  // 3. Mint 1B to deployer
  console.log('[3] Minting 1,000,000,000 CLWDN...');
  const deployerAta = await getAssociatedTokenAddress(MINT, authority.publicKey, false, TOKEN_PROGRAM_ID);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, deployerAta, authority.publicKey, MINT, TOKEN_PROGRAM_ID),
    createMintToInstruction(MINT, deployerAta, authority.publicKey, BigInt(1000000000 * 1e9), [], TOKEN_PROGRAM_ID)
  ), [authority]);
  console.log('    ✅ 1B minted');

  // 4. Distribute per tokenomics
  console.log('[4] Distributing per tokenomics...');
  const allocs = [
    { name: 'LP (40%)', wallet: LP, amount: 400000000 },
    { name: 'Staking (15%)', wallet: STAKING, amount: 150000000 },
    { name: 'Team (15%)', wallet: TEAM, amount: 150000000 },
    { name: 'Community (10%)', wallet: COMMUNITY, amount: 100000000 },
    { name: 'Treasury (10%)', wallet: TREASURY, amount: 100000000 },
  ];
  for (const a of allocs) {
    const ata = await getAssociatedTokenAddress(MINT, a.wallet, false, TOKEN_PROGRAM_ID);
    await sendAndConfirmTransaction(conn, new Transaction().add(
      createAssociatedTokenAccountInstruction(authority.publicKey, ata, a.wallet, MINT, TOKEN_PROGRAM_ID),
      createTransferInstruction(deployerAta, ata, authority.publicKey, BigInt(a.amount * 1e9), [], TOKEN_PROGRAM_ID)
    ), [authority]);
    console.log('    ' + a.name + ': ' + a.amount/1e6 + 'M ✅');
  }
  
  // Dispenser vault (10%)
  const dispenserAta = await getAssociatedTokenAddress(MINT, dispenserPda, true, TOKEN_PROGRAM_ID);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, dispenserAta, dispenserPda, MINT, TOKEN_PROGRAM_ID),
    createTransferInstruction(deployerAta, dispenserAta, authority.publicKey, BigInt(100000000 * 1e9), [], TOKEN_PROGRAM_ID)
  ), [authority]);
  console.log('    Dispenser (10%): 100M ✅');

  // 5. Revoke mint authority
  console.log('[5] Revoking mint authority...');
  await sendAndConfirmTransaction(conn, new Transaction().add(
    createSetAuthorityInstruction(MINT, authority.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)
  ), [authority]);
  console.log('    ✅ Mint authority disabled');

  // 6. Verify
  const mintInfo = await getMint(conn, MINT, 'confirmed', TOKEN_PROGRAM_ID);
  const deployerBal = await getAccount(conn, deployerAta, 'confirmed', TOKEN_PROGRAM_ID);
  const vaultBal = await getAccount(conn, dispenserAta, 'confirmed', TOKEN_PROGRAM_ID);

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  DEPLOYMENT COMPLETE                       ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  Mint: ' + MINT.toBase58().slice(0,36) + '...  ║');
  console.log('║  Supply: ' + (Number(mintInfo.supply)/1e9).toLocaleString() + '                    ║');
  console.log('║  Authority: ' + (mintInfo.mintAuthority ? 'ACTIVE' : 'DISABLED') + '                    ║');
  console.log('║  Metadata: ClawdNation / CLWDN             ║');
  console.log('║  Deployer balance: ' + (Number(deployerBal.amount)/1e9) + '                       ║');
  console.log('║  Vault balance: ' + (Number(vaultBal.amount)/1e9/1e6) + 'M                     ║');
  console.log('╚═══════════════════════════════════════════╝');

  // Save mint address
  fs.writeFileSync('/root/.config/solana/clwdn-wallets/clwdn-mint-final.json', JSON.stringify(Array.from(mintKp.secretKey)));
  console.log('\nMint address: ' + MINT.toBase58());
  console.log('Save this! Update configs with: ' + MINT.toBase58());
})().catch(e => console.error('ERROR:', e.message || e));
