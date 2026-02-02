const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority keypair
const authorityKey = JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));
console.log('Authority:', authority.publicKey.toBase58());

const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');

// Anchor discriminator = sha256("global:<instruction_name>")[0..8]
const crypto = require('crypto');
function anchorDisc(name) {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

async function initDispenser() {
  console.log('\n=== Initializing Dispenser ===');
  
  // State PDA
  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')], DISPENSER_PROGRAM
  );
  console.log('State PDA:', statePda.toBase58());

  // Check if already initialized
  const existing = await conn.getAccountInfo(statePda);
  if (existing) {
    console.log('Dispenser already initialized!');
    return;
  }

  // Build instruction: initialize()
  const disc = anchorDisc('initialize');
  const ix = new TransactionInstruction({
    programId: DISPENSER_PROGRAM,
    keys: [
      { pubkey: statePda, isSigner: false, isWritable: true },
      { pubkey: CLWDN_MINT, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('Dispenser initialized! Sig:', sig);
}

async function initBootstrap() {
  console.log('\n=== Initializing Bootstrap ===');
  
  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM
  );
  console.log('State PDA:', statePda.toBase58());

  const existing = await conn.getAccountInfo(statePda);
  if (existing) {
    console.log('Bootstrap already initialized!');
    return;
  }

  // Build instruction: initialize(target_sol: u64, allocation_cap: u64)
  // target_sol = 10000, allocation_cap = 200_000_000 (200M CLWDN raw with 9 decimals = 200_000_000_000_000_000)
  const disc = anchorDisc('initialize');
  const data = Buffer.alloc(8 + 8 + 8);
  disc.copy(data, 0);
  // target_sol = 10000 (u64 LE)
  data.writeBigUInt64LE(10000n, 8);
  // allocation_cap = 200_000_000_000_000_000 (200M * 10^9 decimals)
  data.writeBigUInt64LE(200_000_000_000_000_000n, 16);

  // Treasury = authority wallet (receives SOL)
  const ix = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: statePda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: true }, // treasury
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },  // authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log('Bootstrap initialized! Sig:', sig);
}

async function main() {
  console.log('Balance:', (await conn.getBalance(authority.publicKey)) / 1e9, 'SOL');
  await initDispenser();
  await initBootstrap();
  
  // Verify
  const [dispenserState] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);
  const [bootstrapState] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
  
  const d = await conn.getAccountInfo(dispenserState);
  const b = await conn.getAccountInfo(bootstrapState);
  console.log('\n=== Verification ===');
  console.log('Dispenser state:', d ? `${d.data.length} bytes` : 'NOT FOUND');
  console.log('Bootstrap state:', b ? `${b.data.length} bytes` : 'NOT FOUND');
  console.log('Balance:', (await conn.getBalance(authority.publicKey)) / 1e9, 'SOL');
}

main().catch(e => { console.error(e); process.exit(1); });
