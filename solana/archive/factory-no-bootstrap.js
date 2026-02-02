/**
 * FACTORY TOKEN LAUNCH - NO BOOTSTRAP MODE (DEFAULT)
 *
 * For bot-created factory tokens that skip bonding curve
 * Direct LP creation with fixed tokenomics
 *
 * Usage: node factory-no-bootstrap.js [--token-name TOKEN] [--lp-sol AMOUNT]
 *
 * Tokenomics (standard factory):
 * - 40% Liquidity (LP) - LOCKED FOREVER (LP burned)
 * - 15% Team - 6m cliff + 12m linear vest
 * - 15% Staking - 4yr linear vest
 * - 10% Community/Airdrops - immediate
 * - 10% Treasury - multisig
 * - 10% Bootstrap - skipped in no-bootstrap mode, goes to LP
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  createBurnInstruction,
  getAssociatedTokenAddress,
  setAuthority,
  AuthorityType
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

// Default tokenomics (NO BOOTSTRAP)
const TOKENOMICS = {
  liquidity: 50,        // 50% (40% + 10% bootstrap → LP)
  team: 15,             // 15% (vested)
  staking: 15,          // 15% (vested)
  community: 10,        // 10% (immediate)
  treasury: 10,         // 10% (multisig)
};

// Default parameters
const DEFAULT_SUPPLY = 1_000_000_000; // 1B tokens
const DEFAULT_LP_SOL = 10; // 10 SOL for LP
const DEFAULT_DECIMALS = 9;

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║    FACTORY TOKEN - NO BOOTSTRAP MODE (DEFAULT)             ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const tokenName = args.find(a => a.startsWith('--token-name'))?.split('=')[1] || 'TEST';
  const lpSOL = parseFloat(args.find(a => a.startsWith('--lp-sol'))?.split('=')[1] || DEFAULT_LP_SOL);

  console.log('📋 CONFIGURATION:\n');
  console.log('  Mode: NO BOOTSTRAP (Direct LP)');
  console.log('  Token Name:', tokenName);
  console.log('  Total Supply:', DEFAULT_SUPPLY.toLocaleString());
  console.log('  LP SOL Amount:', lpSOL, 'SOL');
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('TOKENOMICS (NO BOOTSTRAP):\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const distribution = {};
  let total = 0;
  for (const [key, percent] of Object.entries(TOKENOMICS)) {
    const amount = Math.floor((DEFAULT_SUPPLY * percent) / 100);
    distribution[key] = amount;
    total += amount;
    console.log(`  ${key.padEnd(12)}: ${amount.toLocaleString().padStart(15)} (${percent}%)`);
  }
  console.log('  ' + '-'.repeat(40));
  console.log(`  ${'TOTAL'.padEnd(12)}: ${total.toLocaleString().padStart(15)} (${Object.values(TOKENOMICS).reduce((a,b) => a+b, 0)}%)`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: CREATE TOKEN MINT\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Creating SPL token...');

  const mint = await createMint(
    conn,
    authority,
    authority.publicKey,
    authority.publicKey,
    DEFAULT_DECIMALS,
    undefined,
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );

  console.log('  ✅ Token Mint:', mint.toBase58());
  console.log('  Decimals:', DEFAULT_DECIMALS);
  console.log('  Mint Authority:', authority.publicKey.toBase58());
  console.log('  Freeze Authority:', authority.publicKey.toBase58());
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: DISTRIBUTE TOKENS\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Create token accounts for each allocation
  const accounts = {};

  // Liquidity (will go to LP)
  console.log('  Creating LP token account...');
  accounts.liquidity = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    mint,
    authority.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );
  await mintTo(
    conn,
    authority,
    mint,
    accounts.liquidity.address,
    authority,
    distribution.liquidity * (10 ** DEFAULT_DECIMALS),
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  console.log('    ✅ LP:', accounts.liquidity.address.toBase58());
  console.log('       Amount:', distribution.liquidity.toLocaleString());
  console.log('');

  // Team (vested)
  console.log('  Creating Team token account...');
  accounts.team = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    mint,
    authority.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );
  await mintTo(
    conn,
    authority,
    mint,
    accounts.team.address,
    authority,
    distribution.team * (10 ** DEFAULT_DECIMALS),
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  console.log('    ✅ Team:', accounts.team.address.toBase58());
  console.log('       Amount:', distribution.team.toLocaleString());
  console.log('       Vesting: 6m cliff + 12m linear');
  console.log('');

  // Staking (vested)
  console.log('  Creating Staking token account...');
  accounts.staking = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    mint,
    authority.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );
  await mintTo(
    conn,
    authority,
    mint,
    accounts.staking.address,
    authority,
    distribution.staking * (10 ** DEFAULT_DECIMALS),
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  console.log('    ✅ Staking:', accounts.staking.address.toBase58());
  console.log('       Amount:', distribution.staking.toLocaleString());
  console.log('       Vesting: 4yr linear');
  console.log('');

  // Community (immediate)
  console.log('  Creating Community token account...');
  accounts.community = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    mint,
    authority.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );
  await mintTo(
    conn,
    authority,
    mint,
    accounts.community.address,
    authority,
    distribution.community * (10 ** DEFAULT_DECIMALS),
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  console.log('    ✅ Community:', accounts.community.address.toBase58());
  console.log('       Amount:', distribution.community.toLocaleString());
  console.log('       Vesting: Immediate');
  console.log('');

  // Treasury (multisig)
  console.log('  Creating Treasury token account...');
  accounts.treasury = await getOrCreateAssociatedTokenAccount(
    conn,
    authority,
    mint,
    authority.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_PROGRAM_ID
  );
  await mintTo(
    conn,
    authority,
    mint,
    accounts.treasury.address,
    authority,
    distribution.treasury * (10 ** DEFAULT_DECIMALS),
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );
  console.log('    ✅ Treasury:', accounts.treasury.address.toBase58());
  console.log('       Amount:', distribution.treasury.toLocaleString());
  console.log('       Vesting: Multisig controlled');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 3: CREATE LIQUIDITY POOL\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  LP Configuration:');
  console.log('    SOL Amount:', lpSOL, 'SOL');
  console.log('    Token Amount:', distribution.liquidity.toLocaleString());
  console.log('    Initial Price: 1 SOL =', (distribution.liquidity / lpSOL).toLocaleString(), tokenName);
  console.log('');

  console.log('  To create Raydium CPMM pool:');
  console.log('  ```');
  console.log('  raydium cpmm create \\');
  console.log('    --token-a So11111111111111111111111111111111111111112 \\');
  console.log('    --token-b', mint.toBase58(), '\\');
  console.log('    --amount-a', (lpSOL * LAMPORTS_PER_SOL).toFixed(0), '\\');
  console.log('    --amount-b', (distribution.liquidity * (10 ** DEFAULT_DECIMALS)).toFixed(0), '\\');
  console.log('    --fee-rate 30');
  console.log('  ```');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 4: BURN LP TOKENS (MANDATORY)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  ⚠️  CRITICAL: After pool creation, BURN ALL LP tokens!');
  console.log('');
  console.log('  1. Get LP token mint from pool creation TX');
  console.log('  2. Check balance: spl-token balance <LP_MINT>');
  console.log('  3. Burn ALL: spl-token burn <LP_ACCOUNT> ALL');
  console.log('  4. Verify: spl-token balance <LP_MINT>  # Must be 0');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ TOKEN CREATED - NO BOOTSTRAP MODE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  Token Mint:', mint.toBase58());
  console.log('  Total Supply:', DEFAULT_SUPPLY.toLocaleString());
  console.log('  LP Tokens:', distribution.liquidity.toLocaleString());
  console.log('  LP SOL:', lpSOL, 'SOL');
  console.log('');

  console.log('  Next steps:');
  console.log('  1. Create Raydium pool (see command above)');
  console.log('  2. Burn LP tokens immediately');
  console.log('  3. Set up vesting for Team + Staking');
  console.log('  4. Transfer Treasury to multisig');
  console.log('  5. Announce launch! 🚀');
  console.log('');

  // Save config
  const config = {
    mode: 'no-bootstrap',
    tokenName,
    mint: mint.toBase58(),
    supply: DEFAULT_SUPPLY,
    decimals: DEFAULT_DECIMALS,
    tokenomics: TOKENOMICS,
    distribution,
    accounts: {
      liquidity: accounts.liquidity.address.toBase58(),
      team: accounts.team.address.toBase58(),
      staking: accounts.staking.address.toBase58(),
      community: accounts.community.address.toBase58(),
      treasury: accounts.treasury.address.toBase58(),
    },
    lp: {
      sol: lpSOL,
      tokens: distribution.liquidity,
      initialPrice: distribution.liquidity / lpSOL,
    },
    timestamp: new Date().toISOString(),
  };

  const configPath = path.join(__dirname, `token-${tokenName.toLowerCase()}-config.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('  Config saved:', configPath);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 5: RENOUNCE TOKEN AUTHORITIES (SECURITY)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  🔐 Revoking mint authority (fix supply)...');

  await setAuthority(
    conn,
    authority,
    mint,
    authority.publicKey,
    AuthorityType.MintTokens,
    null,
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );

  console.log('  ✅ Mint authority renounced!');
  console.log('     No more tokens can be minted');
  console.log('     Total supply FIXED at', DEFAULT_SUPPLY.toLocaleString());
  console.log('');

  console.log('  🔐 Revoking freeze authority (unstoppable)...');

  await setAuthority(
    conn,
    authority,
    mint,
    authority.publicKey,
    AuthorityType.FreezeAccount,
    null,
    [],
    { commitment: 'confirmed' },
    TOKEN_PROGRAM_ID
  );

  console.log('  ✅ Freeze authority renounced!');
  console.log('     No accounts can be frozen');
  console.log('     Token is now UNSTOPPABLE');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ TOKEN FULLY DECENTRALIZED\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  🔒 Security Status:');
  console.log('     ✅ Mint authority: NONE (supply fixed)');
  console.log('     ✅ Freeze authority: NONE (unstoppable)');
  console.log('     ⏳ LP tokens: Must burn after pool creation');
  console.log('     ⏳ Vesting: Must deploy contracts');
  console.log('     ⏳ Treasury: Transfer to multisig');
  console.log('');

  // Update config
  config.security = {
    mintAuthority: null,
    freezeAuthority: null,
    supplyFixed: true,
    lpBurned: false,  // Must do after pool creation
    vestingDeployed: false,
    treasuryMultisig: false,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('  Config updated with security status');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
