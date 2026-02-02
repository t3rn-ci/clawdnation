/**
 * ADD OPERATOR - RAW TRANSACTION (No IDL needed)
 *
 * This script manually crafts the add_operator transaction without needing Anchor IDL.
 *
 * IMPORTANT: Run this with a wallet that's ALREADY an operator!
 * For the initial add, you must find and use the original initialization wallet.
 *
 * Usage:
 *   # If you have the original wallet, use it to add current wallet:
 *   AUTH_KEYPAIR=/path/to/original_wallet.json node add-operator-raw.js
 *
 *   # Or set it as environment variable:
 *   export OPERATOR_WALLET=/path/to/original_wallet.json
 *   node add-operator-raw.js
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Dispenser program
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');

// Load operator wallet (must be existing operator)
const operatorPath = process.env.OPERATOR_WALLET || process.env.AUTH_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
console.log('Loading operator wallet from:', operatorPath);

let operatorKeyData;
try {
  operatorKeyData = JSON.parse(fs.readFileSync(operatorPath, 'utf8'));
} catch (e) {
  console.error('❌ Failed to load operator wallet:', e.message);
  console.error('Set OPERATOR_WALLET environment variable to the correct keypair path');
  process.exit(1);
}

const operator = Keypair.fromSecretKey(Uint8Array.from(operatorKeyData));

// New operator to add (default: same as operator, or specify NEW_OPERATOR env var)
const newOperatorStr = process.env.NEW_OPERATOR || operator.publicKey.toBase58();
const newOperator = new PublicKey(newOperatorStr);

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║       ADD OPERATOR - RAW TRANSACTION                      ║');
console.log('╚═══════════════════════════════════════════════════════════╝\\n');

async function main() {
  // Derive dispenser state PDA
  const [dispenserState, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')],
    DISPENSER_PROGRAM
  );

  console.log('📋 Configuration:\\n');
  console.log('  Dispenser Program:', DISPENSER_PROGRAM.toBase58());
  console.log('  Dispenser State PDA:', dispenserState.toBase58());
  console.log('  Operator (signer):', operator.publicKey.toBase58());
  console.log('  New Operator (to add):', newOperator.toBase58());
  console.log('  Network:', RPC.includes('devnet') ? 'Devnet' : 'Mainnet');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');
  console.log('CRAFTING RAW TRANSACTION\\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

  // Compute add_operator instruction discriminator
  // Anchor uses: first 8 bytes of SHA256("global:add_operator")
  const discriminatorInput = "global:add_operator";
  const hash = crypto.createHash('sha256').update(discriminatorInput).digest();
  const discriminator = hash.slice(0, 8);

  console.log('  Instruction discriminator:', discriminator.toString('hex'));
  console.log('');

  // Build instruction data: [discriminator (8 bytes)][new_operator pubkey (32 bytes)]
  const instructionData = Buffer.concat([
    discriminator,
    newOperator.toBuffer()
  ]);

  console.log('  Instruction data length:', instructionData.length, 'bytes');
  console.log('  Instruction data (hex):', instructionData.toString('hex'));
  console.log('');

  // Build accounts
  const keys = [
    { pubkey: dispenserState, isSigner: false, isWritable: true },  // state
    { pubkey: operator.publicKey, isSigner: true, isWritable: false },  // operator (signer)
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId: DISPENSER_PROGRAM,
    data: instructionData,
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');
  console.log('SENDING TRANSACTION\\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');

  try {
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = operator.publicKey;
    const { blockhash } = await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    console.log('  Simulating transaction...\\n');

    // Simulate first
    const simulation = await conn.simulateTransaction(transaction, [operator]);

    if (simulation.value.err) {
      console.error('❌ Transaction simulation failed:\\n');
      console.error(simulation.value.logs?.join('\\n'));
      console.error('\\nError:', simulation.value.err);
      console.error('');
      console.error('Possible reasons:');
      console.error('  1. Operator wallet is not authorized');
      console.error('  2. New operator already exists');
      console.error('  3. Max operators reached (limit: 10)');
      console.error('');
      process.exit(1);
    }

    console.log('✅ Simulation successful!\\n');
    console.log('  Logs:');
    simulation.value.logs?.forEach(log => console.log('   ', log));
    console.log('');

    console.log('  Sending transaction for real...\\n');

    const signature = await conn.sendTransaction(transaction, [operator], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('  Transaction sent:', signature);
    console.log('  Explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
    console.log('  Confirming...\\n');

    await conn.confirmTransaction(signature, 'confirmed');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');
    console.log('✅ SUCCESS\\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n');
    console.log('Operator added successfully!\\n');
    console.log('  New Operator:', newOperator.toBase58());
    console.log('  Transaction:', signature);
    console.log('');
    console.log('To verify:');
    console.log('  node fix-dispenser-operator.js');
    console.log('');

  } catch (err) {
    console.error('❌ Transaction failed:\\n');
    console.error(err.message);
    if (err.logs) {
      console.error('\\nLogs:');
      err.logs.forEach(log => console.error('  ', log));
    }
    console.error('');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
