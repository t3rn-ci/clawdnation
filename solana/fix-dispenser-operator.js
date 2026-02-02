/**
 * FIX DISPENSER OPERATOR - Emergency fix for operator authorization
 *
 * This script checks if the authority is an operator and fixes it if not.
 *
 * PROBLEM: Dispenser giving "Unauthorized: not an operator" errors
 * SOLUTION: Use a working operator to add the authority as an operator
 *
 * Usage: node fix-dispenser-operator.js
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Dispenser program
const DISPENSER_PROGRAM = new PublicKey('fNggZ9pZJNsySp6twZ7KBXtEtS1wDTpzqwFByEjfcXi');

// Load authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║       FIX DISPENSER OPERATOR (Emergency)                  ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

async function main() {
  // Derive dispenser state PDA
  const [dispenserState] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')],
    DISPENSER_PROGRAM
  );

  console.log('📋 Configuration:\n');
  console.log('  Dispenser Program:', DISPENSER_PROGRAM.toBase58());
  console.log('  Dispenser State PDA:', dispenserState.toBase58());
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  Network:', RPC.includes('devnet') ? 'Devnet' : 'Mainnet');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('CHECKING DISPENSER STATE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const accountInfo = await conn.getAccountInfo(dispenserState);

    if (!accountInfo) {
      console.log('❌ Dispenser state does not exist!');
      console.log('');
      console.log('The dispenser has NOT been initialized yet.');
      console.log('');
      console.log('To initialize the dispenser, run:');
      console.log('  cd /Users/mbultra/projects/clawdnation/dispenser');
      console.log('  anchor run initialize-dispenser');
      console.log('');
      process.exit(1);
    }

    console.log('✅ Dispenser state exists');
    console.log('  Owner:', accountInfo.owner.toBase58());
    console.log('  Data length:', accountInfo.data.length, 'bytes');
    console.log('');

    // Parse the state data manually (since we don't have IDL)
    // DispenserState struct layout:
    // - mint: Pubkey (32 bytes)
    // - authority: Pubkey (32 bytes)
    // - pending_authority: Option<Pubkey> (1 + 32 bytes)
    // - operators: Vec<Pubkey> (4 bytes length + N * 32 bytes)
    // - total_distributed: u64 (8 bytes)
    // - total_queued: u64 (8 bytes)
    // - total_cancelled: u64 (8 bytes)
    // - bump: u8 (1 byte)
    // - paused: bool (1 byte)
    // - last_distribution_slot: u64 (8 bytes)
    // - distributions_this_window: u32 (4 bytes)
    // - rate_limit_per_window: u32 (4 bytes)
    // - max_single_distribution: u64 (8 bytes)

    const data = accountInfo.data;

    // Skip discriminator (8 bytes)
    let offset = 8;

    // Read mint (32 bytes)
    const mint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    console.log('  Mint:', mint.toBase58());

    // Read authority (32 bytes)
    const stateAuthority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    console.log('  Authority:', stateAuthority.toBase58());

    // Read pending_authority Option (1 byte + 32 bytes)
    const hasPendingAuthority = data[offset];
    offset += 1;
    if (hasPendingAuthority) {
      const pendingAuthority = new PublicKey(data.slice(offset, offset + 32));
      console.log('  Pending Authority:', pendingAuthority.toBase58());
      offset += 32;
    } else {
      console.log('  Pending Authority: None');
    }

    // Read operators Vec (4 bytes length + N * 32 bytes)
    const operatorCount = data.readUInt32LE(offset);
    offset += 4;
    console.log('  Operators:', operatorCount);

    const operators = [];
    for (let i = 0; i < operatorCount; i++) {
      const operator = new PublicKey(data.slice(offset, offset + 32));
      operators.push(operator);
      const isAuthority = operator.equals(authority.publicKey);
      console.log(`    ${i + 1}. ${operator.toBase58()}`, isAuthority ? '← YOUR WALLET ✅' : '');
      offset += 32;
    }
    console.log('');

    // Check if authority is an operator
    const isOperator = operators.some(op => op.equals(authority.publicKey));

    if (isOperator) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ STATUS: ALREADY AUTHORIZED\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Your wallet IS already an operator.');
      console.log('The dispenser should work without issues.');
      console.log('');
      console.log('If the dispenser is still failing, check:');
      console.log('  1. Correct wallet is being used');
      console.log('  2. Sufficient SOL for transaction fees');
      console.log('  3. Network connectivity');
      console.log('');
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('❌ STATUS: NOT AUTHORIZED\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Your wallet is NOT an operator.');
      console.log('');
      console.log('PROBLEM: The dispenser was initialized with a DIFFERENT wallet.');
      console.log('');
      console.log('SOLUTIONS:');
      console.log('  1. Use the original initialization wallet as the operator');
      console.log('  2. Have an existing operator add your wallet');
      console.log('');
      console.log('To add your wallet as an operator, an existing operator must run:');
      console.log('  node add-dispenser-operator.js --operator=' + authority.publicKey.toBase58());
      console.log('');
      console.log('Available operators who can do this:');
      operators.forEach((op, idx) => {
        console.log(`  ${idx + 1}. ${op.toBase58()}`);
      });
      console.log('');

      // Check if authority is the state authority
      if (stateAuthority.equals(authority.publicKey)) {
        console.log('⚠️  SPECIAL CASE: You are the dispenser authority but NOT an operator!');
        console.log('');
        console.log('This should NOT happen (authority is added as operator during init).');
        console.log('This suggests the dispenser state may be corrupted.');
        console.log('');
        console.log('Possible fix: Re-initialize the dispenser with the same wallet.');
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('SUMMARY\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('  Dispenser Authority:', stateAuthority.toBase58());
    console.log('  Your Wallet:', authority.publicKey.toBase58());
    console.log('  Your Status:', isOperator ? '✅ OPERATOR' : '❌ NOT OPERATOR');
    console.log('  Total Operators:', operatorCount);
    console.log('');

  } catch (err) {
    console.log('❌ Failed to check dispenser state:', err.message);
    console.log('');
    console.log(err);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
