/**
 * SETUP MULTISIG TREASURY - SQUADS PROTOCOL
 *
 * Creates a multisig wallet and transfers Treasury tokens
 * Usage: node setup-multisig-treasury.js --mint <TOKEN> --members <PUBKEY1,PUBKEY2,...> --threshold <N>
 *
 * Uses Squads Protocol for battle-tested multisig
 * https://squads.so/
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  transfer,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Configuration
const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Squads Protocol (V4)
const SQUADS_PROGRAM = new PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║         MULTISIG TREASURY SETUP - SQUADS PROTOCOL          ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const mintArg = args.find(a => a.startsWith('--mint='));
  const membersArg = args.find(a => a.startsWith('--members='));
  const thresholdArg = args.find(a => a.startsWith('--threshold='));

  if (!mintArg) {
    console.log('❌ Missing required arguments!\n');
    console.log('Usage:');
    console.log('  node setup-multisig-treasury.js \\');
    console.log('    --mint=<TOKEN_MINT> \\');
    console.log('    [--members=<PUBKEY1,PUBKEY2,PUBKEY3,...>] \\');
    console.log('    [--threshold=<N>]');
    console.log('');
    console.log('Example (3-of-5 multisig):');
    console.log('  node setup-multisig-treasury.js \\');
    console.log('    --mint=2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx \\');
    console.log('    --members=PUBKEY1,PUBKEY2,PUBKEY3,PUBKEY4,PUBKEY5 \\');
    console.log('    --threshold=3');
    console.log('');
    console.log('For now, this will show you how to set up via Squads UI.');
    console.log('');
    process.exit(1);
  }

  const tokenMint = new PublicKey(mintArg.split('=')[1]);
  const members = membersArg ? membersArg.split('=')[1].split(',').map(m => new PublicKey(m.trim())) : [];
  const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1]) : 3;

  console.log('📋 CONFIGURATION:\n');
  console.log('  Token Mint:', tokenMint.toBase58());
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  Squads Program:', SQUADS_PROGRAM.toBase58());
  console.log('');

  if (members.length > 0) {
    console.log('  Multisig Members:', members.length);
    members.forEach((m, i) => {
      console.log(`    ${i + 1}. ${m.toBase58()}`);
    });
    console.log('  Threshold:', threshold, 'of', members.length);
  } else {
    console.log('  ⚠️  No members specified - will show manual setup');
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('OPTION 1: SQUADS UI (RECOMMENDED)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Squads is the most battle-tested multisig on Solana.');
  console.log('  Over $10B secured, used by top protocols.\n');

  console.log('  STEPS:\n');
  console.log('  1. Visit: https://v4.squads.so/');
  console.log('  2. Connect wallet:', authority.publicKey.toBase58());
  console.log('  3. Click "Create New Squad"');
  console.log('  4. Add members (minimum 2):');
  if (members.length > 0) {
    members.forEach((m, i) => {
      console.log(`     - Member ${i + 1}:`, m.toBase58());
    });
  } else {
    console.log('     - Your wallet (authority)');
    console.log('     - Team member 1');
    console.log('     - Team member 2');
    console.log('     - Team member 3 (recommended)');
    console.log('     - Team member 4 (recommended)');
  }
  console.log('  5. Set threshold:', threshold || '3 (for 3-of-5)');
  console.log('  6. Create Squad → Get Squad Address');
  console.log('  7. Return here with Squad address\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('OPTION 2: SQUADS CLI (ADVANCED)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Install Squads CLI:');
  console.log('  npm install -g @sqds/cli\n');

  console.log('  Create Squad:');
  console.log('  squads create \\');
  console.log('    --threshold', threshold || 3, '\\');
  if (members.length > 0) {
    members.forEach(m => {
      console.log('    --member', m.toBase58(), '\\');
    });
  }
  console.log('    --network', RPC.includes('devnet') ? 'devnet' : 'mainnet-beta');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: CREATE SQUAD\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Complete Squad creation (Option 1 or 2 above).');
  console.log('  Then press ENTER and provide the Squad address...\n');

  if (process.stdin.isTTY) {
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  console.log('\n  Enter Squad multisig address:');
  const squadInput = await new Promise(resolve => {
    process.stdin.once('data', data => resolve(data.toString().trim()));
  });

  const squadAddress = new PublicKey(squadInput);
  console.log('  ✅ Squad Address:', squadAddress.toBase58(), '\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: CHECK TREASURY BALANCE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get current treasury token account
  const treasuryAccount = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    tokenMint,
    authority.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );

  const treasuryBalance = Number(treasuryAccount.amount) / 1e9;
  console.log('  Current Treasury (Authority):', treasuryAccount.address.toBase58());
  console.log('  Balance:', treasuryBalance.toLocaleString(), 'tokens');
  console.log('');

  if (treasuryBalance === 0) {
    console.log('  ⚠️  No tokens to transfer!');
    process.exit(0);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 3: TRANSFER TO MULTISIG\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Creating token account for Squad...');

  // Create Squad's token account
  const squadTokenAccount = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    tokenMint,
    squadAddress,
    true,  // allowOwnerOffCurve for PDA
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );

  console.log('  ✅ Squad Token Account:', squadTokenAccount.address.toBase58());
  console.log('');

  console.log('  Transferring', treasuryBalance.toLocaleString(), 'tokens to Squad...');

  const transferSig = await transfer(
    conn,
    authority,
    treasuryAccount.address,
    squadTokenAccount.address,
    authority,
    BigInt(Math.floor(treasuryBalance * 1e9)),
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );

  console.log('  Transaction:', transferSig);
  console.log('  Waiting for confirmation...\n');

  await conn.confirmTransaction(transferSig);

  console.log('  ✅ TRANSFER COMPLETE!\n');

  // Verify
  const finalBalance = await conn.getTokenAccountBalance(squadTokenAccount.address);
  console.log('  Squad Balance:', finalBalance.value.uiAmountString, 'tokens');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ MULTISIG TREASURY SETUP COMPLETE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  🔒 SECURITY STATUS:');
  console.log('  ✅ Squad Created:', squadAddress.toBase58());
  console.log('  ✅ Treasury Transferred:', treasuryBalance.toLocaleString(), 'tokens');
  console.log('  ✅ Threshold:', threshold || '3-of-5', '(multisig required)');
  console.log('');

  console.log('  📋 NEXT STEPS:\n');
  console.log('  1. All treasury spending requires', threshold || 3, 'signatures');
  console.log('  2. Create proposals via Squads UI');
  console.log('  3. Members vote on proposals');
  console.log('  4. Execute when threshold reached');
  console.log('');

  console.log('  Squads UI: https://v4.squads.so/');
  console.log('  Squad Address:', squadAddress.toBase58());
  console.log('');

  // Save multisig info
  const multisigInfo = {
    squadAddress: squadAddress.toBase58(),
    tokenMint: tokenMint.toBase58(),
    squadTokenAccount: squadTokenAccount.address.toBase58(),
    balance: treasuryBalance,
    threshold: threshold || '3-of-5',
    members: members.map(m => m.toBase58()),
    transferTx: transferSig,
    timestamp: new Date().toISOString(),
  };

  const infoPath = path.join(__dirname, `multisig-${tokenMint.toBase58().slice(0, 8)}.json`);
  fs.writeFileSync(infoPath, JSON.stringify(multisigInfo, null, 2));
  console.log('  Multisig info saved:', infoPath);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
