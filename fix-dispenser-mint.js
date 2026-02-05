/**
 * Close the dispenser state PDA and reinitialize with new mint.
 * Devnet-only: we own the upgrade authority, so we redeploy with a close instruction.
 * 
 * Simpler approach: just deploy a fresh dispenser program.
 * Even simpler: add close + reinitialize to the program.
 * 
 * Simplest for devnet: deploy a new dispenser keypair.
 */
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, TransactionInstruction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json'))));

const NEW_MINT = new PublicKey('Dm5fvVbBFxS3ivM5PUfc6nTccxK5nLcLs4aZKnPdjujj');
const DISPENSER = new PublicKey('4QZsRrXgB9tVReBsPXUKKbKRk87mRT7ZuyqyvWy68QZN');
const [STATE_PDA, bump] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER);

(async () => {
  // Check current state
  const stateInfo = await conn.getAccountInfo(STATE_PDA);
  if (!stateInfo) {
    console.log('No state account — need to initialize fresh');
    return;
  }
  console.log('Current state account size:', stateInfo.data.length);
  const currentMint = new PublicKey(stateInfo.data.slice(8, 40));
  console.log('Current mint:', currentMint.toBase58());
  console.log('Need mint:', NEW_MINT.toBase58());
  
  if (currentMint.equals(NEW_MINT)) {
    console.log('Already correct!');
    return;
  }

  // The vault already has 100M tokens of the new mint
  const vaultAta = await getAssociatedTokenAddress(NEW_MINT, STATE_PDA, true, TOKEN_PROGRAM_ID);
  const vaultBal = await conn.getTokenAccountBalance(vaultAta).catch(() => null);
  console.log('Vault balance:', vaultBal?.value?.uiAmount || 0);

  // We need to reinitialize. Since we can't close PDAs easily without a program instruction,
  // and we can't add instructions to an already-deployed program without redeploying...
  // Let's just redeploy the program with a new keypair.
  console.log('\nSolution: Deploy a fresh dispenser program with new keypair');
  console.log('The old program at', DISPENSER.toBase58(), 'will be abandoned');
  console.log('100M tokens already in vault — need to move to new program vault');
})().catch(e => console.error('ERROR:', e));
