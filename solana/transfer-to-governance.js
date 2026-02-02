/**
 * Transfer Authority to Governance
 *
 * This script proposes authority transfers from hot wallet to governance accounts.
 * Uses the 2-step transfer process built into Bootstrap and Dispenser programs.
 *
 * STEP 1 (this script): Current authority calls transfer_authority()
 * STEP 2 (governance proposal): Governance accepts via accept_authority()
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority keypair
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Program IDs
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');

// Load governance addresses
const governanceAddressesPath = path.join(__dirname, 'governance-addresses.json');
if (!fs.existsSync(governanceAddressesPath)) {
  console.error('❌ governance-addresses.json not found!');
  console.error('Run migrate-to-governance.js first.');
  process.exit(1);
}
const governanceAddresses = JSON.parse(fs.readFileSync(governanceAddressesPath, 'utf8'));

console.log('Authority:', authority.publicKey.toBase58());
console.log('Bootstrap Governance:', governanceAddresses.bootstrapGovernance);
console.log('Dispenser Governance:', governanceAddresses.dispenserGovernance);

// Anchor discriminator
function anchorDisc(name) {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

/**
 * Transfer Bootstrap authority to governance
 */
async function transferBootstrapAuthority() {
  console.log('\n=== Transferring Bootstrap Authority ===');

  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM
  );

  // Check current authority
  const stateAccount = await conn.getAccountInfo(statePda);
  if (!stateAccount) {
    console.error('❌ Bootstrap not initialized!');
    return;
  }

  const currentAuthority = new PublicKey(stateAccount.data.slice(8, 40));
  console.log('Current authority:', currentAuthority.toBase58());

  if (!currentAuthority.equals(authority.publicKey)) {
    console.error('❌ You are not the current authority!');
    return;
  }

  // Build transfer_authority instruction
  const newAuthority = new PublicKey(governanceAddresses.bootstrapGovernance);
  const disc = anchorDisc('transfer_authority');
  const data = Buffer.alloc(8 + 32);
  disc.copy(data, 0);
  newAuthority.toBuffer().copy(data, 8);

  const ix = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: statePda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);

  console.log('✅ Bootstrap authority transfer PROPOSED!');
  console.log('Transaction:', sig);
  console.log('Pending authority:', newAuthority.toBase58());
  console.log('\n⚠️  Governance must now vote to accept authority via accept_authority()');
}

/**
 * Transfer Dispenser authority to governance
 */
async function transferDispenserAuthority() {
  console.log('\n=== Transferring Dispenser Authority ===');

  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')], DISPENSER_PROGRAM
  );

  // Check current authority
  const stateAccount = await conn.getAccountInfo(statePda);
  if (!stateAccount) {
    console.error('❌ Dispenser not initialized!');
    return;
  }

  const currentAuthority = new PublicKey(stateAccount.data.slice(8 + 32, 8 + 32 + 32));
  console.log('Current authority:', currentAuthority.toBase58());

  if (!currentAuthority.equals(authority.publicKey)) {
    console.error('❌ You are not the current authority!');
    return;
  }

  // Build transfer_authority instruction
  const newAuthority = new PublicKey(governanceAddresses.dispenserGovernance);
  const disc = anchorDisc('transfer_authority');
  const data = Buffer.alloc(8 + 32);
  disc.copy(data, 0);
  newAuthority.toBuffer().copy(data, 8);

  const ix = new TransactionInstruction({
    programId: DISPENSER_PROGRAM,
    keys: [
      { pubkey: statePda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);

  console.log('✅ Dispenser authority transfer PROPOSED!');
  console.log('Transaction:', sig);
  console.log('Pending authority:', newAuthority.toBase58());
  console.log('\n⚠️  Governance must now vote to accept authority via accept_authority()');
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          Transfer Authority to Governance                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const balance = await conn.getBalance(authority.publicKey);
  console.log('Authority balance:', balance / 1e9, 'SOL');

  try {
    // Transfer Bootstrap authority
    await transferBootstrapAuthority();

    // Transfer Dispenser authority
    await transferDispenserAuthority();

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║              AUTHORITY TRANSFERS PROPOSED                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    console.log('\n⚠️  CRITICAL NEXT STEPS:');
    console.log('1. Create governance proposals to accept authority');
    console.log('2. Council members vote on proposals');
    console.log('3. Once approved, governance executes accept_authority()');
    console.log('4. Programs are now controlled by governance!');

    console.log('\n📖 PROPOSAL INSTRUCTIONS:');
    console.log('');
    console.log('For Bootstrap:');
    console.log('  Program: BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
    console.log('  Instruction: accept_authority()');
    console.log('  Accounts:');
    console.log('    - state: [bootstrap PDA]');
    console.log('    - new_authority: [Bootstrap Governance]');
    console.log('');
    console.log('For Dispenser:');
    console.log('  Program: AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');
    console.log('  Instruction: accept_authority()');
    console.log('  Accounts:');
    console.log('    - state: [dispenser PDA]');
    console.log('    - new_authority: [Dispenser Governance]');

    console.log('\n🔗 Create proposals at: https://app.realms.today');

  } catch (error) {
    console.error('\n❌ Transfer failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
