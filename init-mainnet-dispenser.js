const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const MINT = new PublicKey('3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG');
const DISPENSER = new PublicKey('C7V7KmwzifnEyjE7HKTyfL67xerkyGXeNh8eHi3bUuxL');
const [statePda] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);

function anchorDisc(name) {
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

(async () => {
  console.log('Dispenser:', DISPENSER.toBase58());
  console.log('State PDA:', statePda.toBase58());
  console.log('Mint:', MINT.toBase58());

  // Step 1: Initialize
  console.log('\nInitializing dispenser...');
  const initDisc = anchorDisc('initialize');
  const initIx = new TransactionInstruction({
    programId: DISPENSER,
    keys: [
      { pubkey: statePda, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initDisc,
  });
  const tx1 = new Transaction().add(initIx);
  const sig1 = await sendAndConfirmTransaction(conn, tx1, [authority]);
  console.log('✅ Initialized:', sig1.slice(0, 40) + '...');

  // Verify
  const stateInfo = await conn.getAccountInfo(statePda);
  const storedMint = new PublicKey(stateInfo.data.slice(8, 40));
  console.log('Stored mint:', storedMint.toBase58(), storedMint.equals(MINT) ? '✅' : '❌');

  // Step 2: Create vault and fund with 100M from authority
  console.log('\nFunding vault with 100M...');
  const vault = await getAssociatedTokenAddress(MINT, statePda, true, TOKEN_PROGRAM_ID);
  const authorityAta = await getAssociatedTokenAddress(MINT, authority.publicKey, false, TOKEN_PROGRAM_ID);
  
  const tx2 = new Transaction().add(
    createAssociatedTokenAccountInstruction(authority.publicKey, vault, statePda, MINT, TOKEN_PROGRAM_ID),
    createTransferInstruction(authorityAta, vault, authority.publicKey, BigInt(100_000_000) * BigInt(1e9), [], TOKEN_PROGRAM_ID)
  );
  const sig2 = await sendAndConfirmTransaction(conn, tx2, [authority]);
  console.log('✅ Vault funded:', sig2.slice(0, 40) + '...');
  
  const bal = await conn.getTokenAccountBalance(vault);
  console.log('Vault balance:', bal.value.uiAmount, 'CLWDN');
  console.log('Vault ATA:', vault.toBase58());
  
  console.log('\n=== MAINNET DISPENSER READY ===');
  console.log('Program:', DISPENSER.toBase58());
  console.log('State:', statePda.toBase58());
  console.log('Vault:', vault.toBase58());
  console.log('Mint:', MINT.toBase58());
})().catch(e => {
  console.error('ERROR:', e.message || e);
  if (e.logs) console.error('Logs:', e.logs);
});
