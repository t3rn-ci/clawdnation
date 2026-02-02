const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, mintTo, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authorityKey = JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const DISPENSER_PROGRAM = new PublicKey('fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi');
const [DISPENSER_STATE] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

async function main() {
  console.log('Authority:', authority.publicKey.toBase58());
  console.log('Dispenser State PDA:', DISPENSER_STATE.toBase58());
  
  // CLWDN uses regular SPL Token (NOT Token-2022)
  const ata = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true, TOKEN_PROGRAM_ID);
  console.log('Vault ATA:', ata.toBase58());

  try {
    const acct = await getAccount(conn, ata, 'confirmed', TOKEN_PROGRAM_ID);
    console.log('Vault exists! Balance:', Number(acct.amount) / 1e9, 'CLWDN');
  } catch {
    console.log('Creating vault...');
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey, ata, DISPENSER_STATE, CLWDN_MINT, TOKEN_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
    console.log('Vault created:', sig);
  }

  // Fund vault
  const vaultAcct = await getAccount(conn, ata, 'confirmed', TOKEN_PROGRAM_ID);
  if (vaultAcct.amount === 0n) {
    console.log('\nMinting 100M CLWDN to vault...');
    const mintAmount = 100_000_000_000_000_000n;
    const sig = await mintTo(conn, authority, CLWDN_MINT, ata, authority, mintAmount, [], { commitment: 'confirmed' }, TOKEN_PROGRAM_ID);
    console.log('Minted! Sig:', sig);
    
    const updated = await getAccount(conn, ata, 'confirmed', TOKEN_PROGRAM_ID);
    console.log('Vault balance:', Number(updated.amount) / 1e9, 'CLWDN');
  } else {
    console.log('Vault balance:', Number(vaultAcct.amount) / 1e9, 'CLWDN');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
