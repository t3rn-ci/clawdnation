const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority keypair
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));
console.log('Authority:', authority.publicKey.toBase58());

const BOOTSTRAP_PROGRAM = new PublicKey('CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC');

// Anchor discriminator
const crypto = require('crypto');
function anchorDisc(name) {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

async function updateBootstrapCap() {
  console.log('\n=== Updating Bootstrap Allocation Cap ===');

  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM
  );
  console.log('Bootstrap State PDA:', statePda.toBase58());

  // Check current state
  const stateAccount = await conn.getAccountInfo(statePda);
  if (!stateAccount) {
    console.error('❌ Bootstrap not initialized!');
    return;
  }

  // Read current allocation cap (at offset 8 + 32 + 1 + 32 + 1 + 8 + 8 + 8 + 8)
  const offset = 8 + 32 + 1 + 32 + 1 + 8 + 8 + 8 + 8;
  const currentCap = stateAccount.data.readBigUInt64LE(offset);
  console.log(`Current allocation cap: ${currentCap} (${Number(currentCap) / 1e9} CLWDN)`);

  // New cap: 200M CLWDN = 200_000_000_000_000_000
  const newCap = 200_000_000_000_000_000n;
  console.log(`New allocation cap: ${newCap} (${Number(newCap) / 1e9} CLWDN)`);

  if (currentCap === newCap) {
    console.log('✅ Allocation cap already set to 200M CLWDN!');
    return;
  }

  // Build instruction: update_cap(new_cap: u64)
  const disc = anchorDisc('update_cap');
  const data = Buffer.alloc(8 + 8);
  disc.copy(data, 0);
  data.writeBigUInt64LE(newCap, 8);

  const ix = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: statePda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  console.log('\nSending update_cap transaction...');
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('✅ Bootstrap allocation cap updated!');
  console.log('Transaction:', sig);

  // Verify
  const updatedAccount = await conn.getAccountInfo(statePda);
  const updatedCap = updatedAccount.data.readBigUInt64LE(offset);
  console.log(`\nVerified new cap: ${updatedCap} (${Number(updatedCap) / 1e9} CLWDN)`);

  if (updatedCap === newCap) {
    console.log('✅ SUCCESS: Bootstrap cap now set to 200M CLWDN (20% of 1B supply)');
  } else {
    console.log('⚠️  WARNING: Cap mismatch after update!');
  }
}

async function main() {
  console.log('Balance:', (await conn.getBalance(authority.publicKey)) / 1e9, 'SOL');
  await updateBootstrapCap();
}

main().catch(e => { console.error(e); process.exit(1); });
