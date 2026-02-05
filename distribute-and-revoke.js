const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, createSetAuthorityInstruction, AuthorityType } = require('@solana/spl-token');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));
const MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');

// Wallets
const LP = new PublicKey('3Y3g183jbpyj1Nq9eDTfegGLMhgMXTBMviBus92Pp7rk');
const STAKING = new PublicKey('BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8');
const TEAM = new PublicKey('3DAZTJRxzyLkqzvqiqYZrUcAmM2CHKG7VJe69Rb24iQQ');
const COMMUNITY = new PublicKey('2MT5NRrXB2ioGtnvtpUG3f8it99cCCpUf7SzaiJKeB3h');
const TREASURY = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');

const DISPENSER = new PublicKey('B25uk3KvnZxWJ1Ji1XLdtYq4gSmMsev8RPS1e8tjaNQk');
const [dispenserPda] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);

const allocations = [
  { name: 'LP', wallet: LP, amount: 400000000 },
  { name: 'Staking', wallet: STAKING, amount: 150000000 },
  { name: 'Team', wallet: TEAM, amount: 150000000 },
  { name: 'Community', wallet: COMMUNITY, amount: 100000000 },
  { name: 'Treasury', wallet: TREASURY, amount: 100000000 },
];
// Remaining 100M stays for dispenser vault

(async () => {
  const authorityAta = await getAssociatedTokenAddress(MINT, authority.publicKey, false, TOKEN_PROGRAM_ID);
  
  console.log('=== Distributing 1B CLWDN per tokenomics ===\n');
  
  for (const alloc of allocations) {
    const destAta = await getAssociatedTokenAddress(MINT, alloc.wallet, false, TOKEN_PROGRAM_ID);
    const tx = new Transaction();
    tx.add(createAssociatedTokenAccountInstruction(authority.publicKey, destAta, alloc.wallet, MINT, TOKEN_PROGRAM_ID));
    tx.add(createTransferInstruction(authorityAta, destAta, authority.publicKey, BigInt(alloc.amount * 1e9), [], TOKEN_PROGRAM_ID));
    const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
    console.log(alloc.name + ' (' + alloc.amount/1e6 + 'M): ' + sig.slice(0, 30) + '...');
  }

  // Dispenser vault (100M)
  const dispenserAta = await getAssociatedTokenAddress(MINT, dispenserPda, true, TOKEN_PROGRAM_ID);
  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountInstruction(authority.publicKey, dispenserAta, dispenserPda, MINT, TOKEN_PROGRAM_ID));
  tx.add(createTransferInstruction(authorityAta, dispenserAta, authority.publicKey, BigInt(100000000 * 1e9), [], TOKEN_PROGRAM_ID));
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('Dispenser (100M): ' + sig.slice(0, 30) + '...');

  // Revoke mint authority
  console.log('\n=== Revoking mint authority ===');
  const revokeTx = new Transaction().add(
    createSetAuthorityInstruction(MINT, authority.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)
  );
  const revokeSig = await sendAndConfirmTransaction(conn, revokeTx, [authority]);
  console.log('Revoked:', revokeSig.slice(0, 30) + '...');

  // Verify
  const { getMint } = require('@solana/spl-token');
  const mintInfo = await getMint(conn, MINT, 'confirmed', TOKEN_PROGRAM_ID);
  console.log('\n=== FINAL STATE ===');
  console.log('Mint:', MINT.toBase58());
  console.log('Supply:', Number(mintInfo.supply) / 1e9);
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58() || 'DISABLED');
  console.log('Decimals:', mintInfo.decimals);
  console.log('Metadata: ClawdNation / CLWDN ✅');
})().catch(e => console.error('ERROR:', e.message || e));
