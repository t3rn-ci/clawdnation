const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

const RPC = 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const authorityPath = path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const { Keypair } = require('@solana/web3.js');
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');

const [dispenserState] = PublicKey.findProgramAddressSync(
  [Buffer.from('state')],
  DISPENSER_PROGRAM
);

console.log('╔══════════════════════════════════════════════╗');
console.log('║       DISPENSER STATE CHECK                  ║');
console.log('╚══════════════════════════════════════════════╝\n');
console.log('Dispenser State PDA:', dispenserState.toBase58());
console.log('Authority Public Key:', authority.publicKey.toBase58());
console.log('');

const idlPath = path.join(__dirname, '../dispenser/target/idl/clwdn_dispenser.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

const provider = new AnchorProvider(
  conn,
  { publicKey: authority.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
  { commitment: 'confirmed' }
);

const program = new Program(idl, DISPENSER_PROGRAM, provider);

program.account.dispenserState.fetch(dispenserState).then(state => {
  console.log('Dispenser State:');
  console.log('  Mint:', state.mint.toBase58());
  console.log('  Authority:', state.authority.toBase58());
  console.log('  Paused:', state.paused);
  console.log('  Operators:', state.operators.length);
  state.operators.forEach((op, idx) => {
    const isAuthority = op.equals(authority.publicKey);
    console.log('    ' + (idx + 1) + '.', op.toBase58(), isAuthority ? '← THIS WALLET ✅' : '');
  });
  console.log('  Total Distributed:', state.totalDistributed.toString());
  console.log('  Total Queued:', state.totalQueued.toString());
  console.log('');

  const isAuthorityOperator = state.operators.some(op => op.equals(authority.publicKey));
  if (isAuthorityOperator) {
    console.log('✅ Authority IS an operator - dispenser should work!');
  } else {
    console.log('❌ Authority is NOT an operator - need to add with:');
    console.log('   node add-dispenser-operator.js');
  }
  process.exit(0);
}).catch(err => {
  console.log('❌ Failed to fetch dispenser state');
  console.log('Error:', err.message);
  console.log('');
  console.log('Possible issues:');
  console.log('  1. Dispenser not initialized yet');
  console.log('  2. Wrong network (check RPC)');
  process.exit(1);
});
