/**
 * ADD DISPENSER OPERATOR
 *
 * Authorizes an operator wallet to call dispense_clawdnation()
 * This unblocks the automatic CLWDN distribution after SOL contributions
 *
 * Usage: node add-dispenser-operator.js [--operator=<PUBKEY>]
 */

const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { Program, AnchorProvider, web3, BN } = require('@project-serum/anchor');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Dispenser program
const DISPENSER_PROGRAM = new PublicKey('fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║          ADD DISPENSER OPERATOR                            ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

function parseArgs() {
  const args = process.argv.slice(2);
  const operatorArg = args.find(a => a.startsWith('--operator='));

  return {
    operator: operatorArg ? operatorArg.split('=')[1] : authority.publicKey.toBase58()
  };
}

async function main() {
  const config = parseArgs();
  const operator = new PublicKey(config.operator);

  console.log('📋 Configuration:\n');
  console.log('  Dispenser Program:', DISPENSER_PROGRAM.toBase58());
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  Operator to Add:', operator.toBase58());
  console.log('  Network:', RPC.includes('devnet') ? 'Devnet' : 'Mainnet');
  console.log('');

  // Derive dispenser state PDA
  const [dispenserState] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')],
    DISPENSER_PROGRAM
  );

  console.log('  Dispenser State PDA:', dispenserState.toBase58());
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('ADDING OPERATOR\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Load program IDL
  const idlPath = path.join(__dirname, '../dispenser/target/idl/clwdn_dispenser.json');
  let idl;

  try {
    idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  } catch (e) {
    console.log('❌ Could not load IDL from:', idlPath);
    console.log('   Make sure you have built the dispenser program with: anchor build');
    process.exit(1);
  }

  // Create provider and program
  const provider = new AnchorProvider(
    conn,
    { publicKey: authority.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
    { commitment: 'confirmed' }
  );

  const program = new Program(idl, DISPENSER_PROGRAM, provider);

  try {
    console.log('Calling add_operator instruction...\n');

    const tx = await program.methods
      .addOperator(operator)
      .accounts({
        state: dispenserState,
        operator: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    console.log('✅ Operator added successfully!\n');
    console.log('Transaction:', tx);
    console.log('Explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log('');

    // Verify by fetching state
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('VERIFICATION\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const state = await program.account.dispenserState.fetch(dispenserState);

    console.log('Dispenser State:');
    console.log('  Mint:', state.mint.toBase58());
    console.log('  Authority:', state.authority.toBase58());
    console.log('  Paused:', state.paused);
    console.log('  Operators:', state.operators.length);
    state.operators.forEach((op, idx) => {
      console.log(`    ${idx + 1}. ${op.toBase58()}`, op.equals(operator) ? '← NEWLY ADDED ✅' : '');
    });
    console.log('  Total Distributed:', state.totalDistributed.toString(), 'tokens');
    console.log('  Total Queued:', state.totalQueued.toString(), 'tokens');
    console.log('');

    if (state.operators.some(op => op.equals(operator))) {
      console.log('✅ VERIFIED: Operator successfully added!');
      console.log('');
      console.log('🚀 The dispenser can now distribute CLWDN when users send SOL!');
    } else {
      console.log('⚠️  WARNING: Operator not found in state. Check transaction.');
    }

  } catch (err) {
    console.log('❌ Failed to add operator:\n');
    console.log(err);
    console.log('');
    console.log('Common issues:');
    console.log('  1. Not using an existing operator wallet (authority is automatically added at init)');
    console.log('  2. Dispenser state not initialized yet');
    console.log('  3. Operator already added');
    process.exit(1);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('NEXT STEPS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  1. Start dispenser service:');
  console.log('     node dispenser-service.js\n');
  console.log('  2. Test by sending SOL to bootstrap state\n');
  console.log('  3. Dispenser will automatically distribute CLWDN ✅');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
