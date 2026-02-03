#!/usr/bin/env node
/**
 * CLWDN Token Genesis — Full automated sequence
 * 
 * Usage:
 *   node create-token.js                    # devnet (default)
 *   node create-token.js --network=mainnet  # mainnet
 *   node create-token.js --dry-run          # show plan without executing
 *
 * Order: create mint → add metadata → mint supply → distribute → revoke authority
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, TransactionInstruction } = require('@solana/web3.js');
const { createInitializeMintInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMinimumBalanceForRentExemptMint,
        getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction,
        createTransferInstruction, createSetAuthorityInstruction, AuthorityType } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// === CONFIG ===
const args = process.argv.slice(2).reduce((a, v) => { const [k, val] = v.replace(/^--/, '').split('='); a[k] = val || true; return a; }, {});
const NETWORK = args.network || 'devnet';
const DRY_RUN = args['dry-run'] || false;
const RPC = NETWORK === 'mainnet' 
  ? (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
  : 'https://api.devnet.solana.com';

const SUPPLY = 1_000_000_000;  // 1B tokens
const DECIMALS = 9;
const TOKEN_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Metadata
const TOKEN_NAME = 'ClawdNation';
const TOKEN_SYMBOL = 'CLWDN';
const TOKEN_URI = 'https://clawdnation.com/metadata.json';

// Wallet paths (relative to /root/.config/solana/clwdn-wallets/)
const WALLET_DIR = '/root/.config/solana/clwdn-wallets/';
const AUTHORITY_PATH = process.env.KEYPAIR_PATH || '/root/.config/solana/clawdnation.json';

const ALLOCATIONS = [
  { name: 'LP',        pct: 40, file: 'lp.json' },
  { name: 'Staking',   pct: 15, file: 'staking.json' },
  { name: 'Team',      pct: 15, file: 'team.json' },
  { name: 'Community', pct: 10, file: 'community.json' },
  { name: 'Treasury',  pct: 10, file: 'treasury.json' },
  // Remaining 10% goes to dispenser vault (handled separately)
];

function encodeString(s) {
  const buf = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length);
  return Buffer.concat([len, buf]);
}

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  CLWDN Token Genesis — ' + NETWORK.toUpperCase());
  console.log('═══════════════════════════════════════════');
  console.log('RPC:', RPC);
  console.log('Supply:', SUPPLY.toLocaleString(), '(' + DECIMALS + ' decimals)');
  console.log('Metadata:', TOKEN_NAME, '/', TOKEN_SYMBOL);
  console.log('URI:', TOKEN_URI);
  console.log();

  const conn = new Connection(RPC, 'confirmed');
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(AUTHORITY_PATH))));
  console.log('Authority:', authority.publicKey.toBase58());

  const balance = await conn.getBalance(authority.publicKey);
  console.log('Balance:', (balance / 1e9).toFixed(4), 'SOL');
  
  if (balance < 0.1 * 1e9) {
    console.error('ERROR: Insufficient SOL balance. Need at least 0.1 SOL.');
    process.exit(1);
  }

  // Load allocation wallets
  const wallets = [];
  for (const alloc of ALLOCATIONS) {
    const kpPath = path.join(WALLET_DIR, alloc.file);
    if (!fs.existsSync(kpPath)) {
      console.error('ERROR: Missing wallet keypair:', kpPath);
      process.exit(1);
    }
    const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath))));
    wallets.push({ ...alloc, keypair: kp, address: kp.publicKey });
    console.log('  ' + alloc.name + ' (' + alloc.pct + '%):', kp.publicKey.toBase58());
  }
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — would execute the following steps:');
    console.log('  1. Create mint account');
    console.log('  2. Add Metaplex metadata');
    console.log('  3. Mint', SUPPLY.toLocaleString(), 'tokens');
    console.log('  4. Distribute to', wallets.length, 'wallets');
    console.log('  5. Revoke mint authority');
    console.log('  (Dispenser vault funding done separately after dispenser init)');
    process.exit(0);
  }

  if (NETWORK === 'mainnet') {
    console.log('⚠️  MAINNET DEPLOYMENT — waiting 10 seconds...');
    console.log('    Press Ctrl+C to abort.');
    await new Promise(r => setTimeout(r, 10000));
  }

  // === STEP 1: Create mint ===
  console.log('\n[1/5] Creating mint...');
  const mintKeypair = Keypair.generate();
  const MINT = mintKeypair.publicKey;
  
  // Save mint keypair
  const mintKeyPath = path.join(WALLET_DIR, 'clwdn-mint-' + NETWORK + '.json');
  fs.writeFileSync(mintKeyPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
  console.log('  Mint keypair saved:', mintKeyPath);

  const rent = await getMinimumBalanceForRentExemptMint(conn);
  const tx1 = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: authority.publicKey, newAccountPubkey: MINT, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
    createInitializeMintInstruction(MINT, DECIMALS, authority.publicKey, null, TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, tx1, [authority, mintKeypair]);
  console.log('  ✅ Mint:', MINT.toBase58());

  // === STEP 2: Add Metaplex metadata ===
  console.log('\n[2/5] Adding metadata...');
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM.toBuffer(), MINT.toBuffer()],
    TOKEN_METADATA_PROGRAM
  );
  const metaData = Buffer.concat([
    Buffer.from([33]),  // CreateMetadataAccountV3
    encodeString(TOKEN_NAME),
    encodeString(TOKEN_SYMBOL),
    encodeString(TOKEN_URI),
    Buffer.from([0, 0]),  // seller_fee_basis_points
    Buffer.from([0]),     // creators: None
    Buffer.from([0]),     // collection: None
    Buffer.from([0]),     // uses: None
    Buffer.from([1]),     // is_mutable (can update URI later)
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
  console.log('  ✅ Metadata:', TOKEN_NAME, '/', TOKEN_SYMBOL);
  console.log('  URI:', TOKEN_URI);

  // === STEP 3: Mint supply ===
  console.log('\n[3/5] Minting', SUPPLY.toLocaleString(), 'tokens...');
  const authorityAta = await getAssociatedTokenAddress(MINT, authority.publicKey, false, TOKEN_PROGRAM_ID);
  const tx3 = new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, authorityAta, authority.publicKey, MINT, TOKEN_PROGRAM_ID),
    createMintToInstruction(MINT, authorityAta, authority.publicKey, BigInt(SUPPLY) * BigInt(10 ** DECIMALS), [], TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, tx3, [authority]);
  console.log('  ✅ Minted:', SUPPLY.toLocaleString(), TOKEN_SYMBOL);

  // === STEP 4: Distribute ===
  console.log('\n[4/5] Distributing...');
  let distributed = 0;
  for (const w of wallets) {
    const amount = (SUPPLY * w.pct) / 100;
    const destAta = await getAssociatedTokenAddress(MINT, w.address, false, TOKEN_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(authority.publicKey, destAta, w.address, MINT, TOKEN_PROGRAM_ID),
      createTransferInstruction(authorityAta, destAta, authority.publicKey, BigInt(amount) * BigInt(10 ** DECIMALS), [], TOKEN_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(conn, tx, [authority]);
    distributed += amount;
    console.log('  ' + w.name + ':', (amount / 1e6) + 'M (' + w.pct + '%)');
  }
  const remaining = SUPPLY - distributed;
  console.log('  Remaining in authority (for dispenser):', (remaining / 1e6) + 'M');

  // === STEP 5: Revoke mint authority ===
  console.log('\n[5/5] Revoking mint authority...');
  const tx5 = new Transaction().add(
    createSetAuthorityInstruction(MINT, authority.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(conn, tx5, [authority]);
  console.log('  ✅ Mint authority: REVOKED');

  // === SUMMARY ===
  const { getMint } = require('@solana/spl-token');
  const mintInfo = await getMint(conn, MINT, 'confirmed', TOKEN_PROGRAM_ID);
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  GENESIS COMPLETE — ' + NETWORK.toUpperCase());
  console.log('═══════════════════════════════════════════');
  console.log('Mint:', MINT.toBase58());
  console.log('Supply:', (Number(mintInfo.supply) / 10 ** DECIMALS).toLocaleString());
  console.log('Decimals:', DECIMALS);
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58() || 'REVOKED ✅');
  console.log('Metadata:', TOKEN_NAME, '/', TOKEN_SYMBOL, '✅');
  console.log('Mint keypair:', mintKeyPath);
  console.log();
  console.log('NEXT STEPS:');
  console.log('  1. Deploy dispenser program (if new)');
  console.log('  2. Initialize dispenser with this mint');
  console.log('  3. Transfer', (remaining / 1e6) + 'M from authority to dispenser vault');
  console.log('  4. Update .env + serve.js + dispenser-service.js with new mint');
  console.log('  5. Restart services');
})().catch(e => {
  console.error('\n❌ ERROR at step:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs.slice(-5));
  process.exit(1);
});
