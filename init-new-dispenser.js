const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const MINT = new PublicKey('Dm5fvVbBFxS3ivM5PUfc6nTccxK5nLcLs4aZKnPdjujj');
const NEW_DISPENSER = new PublicKey('DauUaBLK9aut1WLqiL9kmpmc2x1MJNbEtHeVBQZYmFWK');
const OLD_DISPENSER = new PublicKey('4QZsRrXgB9tVReBsPXUKKbKRk87mRT7ZuyqyvWy68QZN');

const [newStatePda] = PublicKey.findProgramAddressSync([Buffer.from('state')], NEW_DISPENSER);
const [oldStatePda] = PublicKey.findProgramAddressSync([Buffer.from('state')], OLD_DISPENSER);

function anchorDisc(name) {
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

(async () => {
  console.log('New dispenser:', NEW_DISPENSER.toBase58());
  console.log('New state PDA:', newStatePda.toBase58());

  // Step 1: Initialize new dispenser
  console.log('\n=== Step 1: Initialize ===');
  const initDisc = anchorDisc('initialize');
  const initIx = new TransactionInstruction({
    programId: NEW_DISPENSER,
    keys: [
      { pubkey: newStatePda, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initDisc,
  });
  const tx1 = new Transaction().add(initIx);
  const sig1 = await sendAndConfirmTransaction(conn, tx1, [authority]);
  console.log('Initialized:', sig1.slice(0, 40) + '...');

  // Verify
  const stateInfo = await conn.getAccountInfo(newStatePda);
  const storedMint = new PublicKey(stateInfo.data.slice(8, 40));
  console.log('Stored mint:', storedMint.toBase58(), storedMint.equals(MINT) ? '✅' : '❌');

  // Step 2: Create vault (ATA for new state PDA) and fund with 100M
  console.log('\n=== Step 2: Fund vault ===');
  const newVault = await getAssociatedTokenAddress(MINT, newStatePda, true, TOKEN_PROGRAM_ID);
  
  // First, we need to get the 100M from old vault back to authority
  // Old vault is owned by oldStatePda - we can't transfer from it without the old program
  // But we can transfer fresh from authority's ATA (which got 0 in distribution since all 1B was distributed)
  // Actually, the authority ATA should have 0 since we distributed everything...
  
  const authorityAta = await getAssociatedTokenAddress(MINT, authority.publicKey, false, TOKEN_PROGRAM_ID);
  const authBal = await conn.getTokenAccountBalance(authorityAta).catch(() => null);
  console.log('Authority CLWDN balance:', authBal?.value?.uiAmount || 0);
  
  const oldVault = await getAssociatedTokenAddress(MINT, oldStatePda, true, TOKEN_PROGRAM_ID);
  const oldBal = await conn.getTokenAccountBalance(oldVault).catch(() => null);
  console.log('Old vault CLWDN balance:', oldBal?.value?.uiAmount || 0);
  
  // We can't move from old vault (owned by old program's PDA)
  // We need to use the old program's distribute function... but the old program has wrong mint stored
  // 
  // Solution: the 100M in old vault is stuck. We need to get 100M from somewhere else.
  // Options:
  // a) Pull from one of the allocation wallets (we own the keypairs)
  // b) The old vault has 100M of NEW mint tokens — they're accessible if old program can sign, but it can't for new mint
  //
  // Actually wait — the old dispenser PDA OWNS the ATA. The PDA can only sign via the old program.
  // The old program thinks mint is HL4H8T... so it won't process Dm5fvV tokens.
  // Those 100M are effectively stuck in the old vault.
  //
  // Best bet: take 100M from one of the allocation wallets temporarily.

  console.log('\n⚠️  100M CLWDN stuck in old vault (PDA of abandoned dispenser)');
  console.log('Need to source 100M from allocation wallets');
  
  // Check which wallets have tokens
  const wallets = {
    'Community': '2MT5NRrXB2ioGtnvtpUG3f8it99cCCpUf7SzaiJKeB3h',
    'Treasury': '8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8',
  };
  
  for (const [name, addr] of Object.entries(wallets)) {
    const ata = await getAssociatedTokenAddress(MINT, new PublicKey(addr), false, TOKEN_PROGRAM_ID);
    const bal = await conn.getTokenAccountBalance(ata).catch(() => null);
    console.log(name + ':', bal?.value?.uiAmount || 0);
  }
  
  // Use Treasury (100M) to fund dispenser vault
  const treasuryPub = new PublicKey('8yY2uxCdrkjHRxeCD5hq4cxNnSPrcn2MEYinhRdCKCn8');
  const treasuryKey = JSON.parse(fs.readFileSync('/root/.config/solana/clwdn-wallets/treasury.json'));
  const treasuryKp = Keypair.fromSecretKey(Uint8Array.from(treasuryKey));
  
  const treasuryAta = await getAssociatedTokenAddress(MINT, treasuryPub, false, TOKEN_PROGRAM_ID);
  
  const tx2 = new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, newVault, newStatePda, MINT, TOKEN_PROGRAM_ID),
    createTransferInstruction(treasuryAta, newVault, treasuryPub, BigInt(100_000_000) * BigInt(1e9), [], TOKEN_PROGRAM_ID)
  );
  const sig2 = await sendAndConfirmTransaction(conn, tx2, [authority, treasuryKp]);
  console.log('Funded vault from Treasury:', sig2.slice(0, 40) + '...');
  
  const newBal = await conn.getTokenAccountBalance(newVault);
  console.log('New vault balance:', newBal.value.uiAmount, 'CLWDN');
  
  console.log('\n=== DONE ===');
  console.log('Dispenser:', NEW_DISPENSER.toBase58());
  console.log('State PDA:', newStatePda.toBase58());
  console.log('Vault:', newVault.toBase58());
  console.log('Mint:', MINT.toBase58());
  console.log('\nNote: Treasury now has 0 CLWDN (donated to dispenser vault)');
  console.log('Old vault at', oldVault.toBase58(), 'has 100M stuck (unrecoverable without old program)');
})().catch(e => {
  console.error('ERROR:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs);
});
