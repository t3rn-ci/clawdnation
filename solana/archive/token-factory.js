/**
 * ClawdNation Token Factory — Solana (CLI-based)
 * 
 * Creates SPL tokens with Token-2022 metadata on demand.
 * 
 * Tokenomics (per token):
 *   70% → Raydium CPMM liquidity pool (TOKEN/SOL)
 *   10% → Creator (linear vest, 1/12th per month over 12 months)
 *   10% → ClawdNation Treasury
 *   10% → Burned at mint 🔥
 * 
 * Usage:
 *   node token-factory.js --name "Token Name" --symbol "TKN" --description "desc" --recipient "solana_address"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { createPool } = require('./create-pool');

const SOLANA_PATH = '/root/.local/share/solana/install/active_release/bin';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || '/root/.config/solana/clawdnation.json';
const METADATA_BASE_URL = process.env.METADATA_BASE_URL || 'https://clawdnation.com';
const DEFAULT_SUPPLY = 1_000_000_000; // 1B
const DECIMALS = 9;
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// Tokenomics split
const SPLIT = {
  liquidity: 70,  // % → Raydium pool
  creator: 10,    // % → vested to creator (12m linear)
  treasury: 10,   // % → ClawdNation treasury
  burn: 10,       // % → burned at mint
};

// Pool SOL amount (from payment)
const POOL_SOL_AMOUNT = process.env.POOL_SOL_AMOUNT || '100000000'; // 0.1 SOL default

// Vesting file to track creator vesting
const VESTING_PATH = path.join(__dirname, 'vesting.json');

function cli(cmd) {
  const fullCmd = `export PATH="${SOLANA_PATH}:/usr/bin:/bin:$PATH"; ${cmd}`;
  console.log(`   $ ${cmd}`);
  const out = execSync(fullCmd, { encoding: 'utf8', timeout: 60000 }).trim();
  if (out) console.log(`   → ${out.split('\n')[0]}`);
  return out;
}

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace('--', '');
    args[key] = argv[i + 1];
  }
  return args;
}

function loadVesting() {
  try {
    if (fs.existsSync(VESTING_PATH)) return JSON.parse(fs.readFileSync(VESTING_PATH, 'utf8'));
  } catch {}
  return {};
}

function saveVesting(data) {
  fs.writeFileSync(VESTING_PATH, JSON.stringify(data, null, 2));
}

function addVestingEntry(mint, { creator, totalTokens, symbol, name }) {
  const vesting = loadVesting();
  vesting[mint] = {
    creator,
    totalTokens,
    claimedTokens: 0,
    vestingMonths: 12,
    monthlyUnlock: Math.floor(totalTokens / 12),
    startDate: new Date().toISOString(),
    lastClaim: null,
    claimCount: 0,
    symbol,
    name,
  };
  saveVesting(vesting);
  console.log(`   📋 Vesting entry created: ${totalTokens.toLocaleString()} ${symbol} over 12 months for ${creator}`);
}

async function createToken({ name, symbol, description, image, recipient, supply, solForPool }) {
  supply = parseInt(supply) || DEFAULT_SUPPLY;
  
  // Calculate token splits
  const liquidityTokens = Math.floor(supply * SPLIT.liquidity / 100);
  const creatorTokens = Math.floor(supply * SPLIT.creator / 100);
  const treasuryTokens = Math.floor(supply * SPLIT.treasury / 100);
  const burnTokens = supply - liquidityTokens - creatorTokens - treasuryTokens; // remainder to burn (handles rounding)
  
  // Load keypair to get authority address
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  const { Keypair } = require('@solana/web3.js');
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
  const authorityAddr = authority.publicKey.toBase58();
  
  const recipientAddr = recipient || authorityAddr;
  
  console.log(`🏭 Creating token: ${name} ($${symbol})`);
  console.log(`   Total Supply: ${supply.toLocaleString()}`);
  console.log(`   Authority/Treasury: ${authorityAddr}`);
  console.log(`   Creator: ${recipientAddr}`);
  console.log(`\n   📊 Tokenomics:`);
  console.log(`   💧 Liquidity Pool: ${liquidityTokens.toLocaleString()} (${SPLIT.liquidity}%)`);
  console.log(`   👤 Creator (vested): ${creatorTokens.toLocaleString()} (${SPLIT.creator}%)`);
  console.log(`   🏦 Treasury:         ${treasuryTokens.toLocaleString()} (${SPLIT.treasury}%)`);
  console.log(`   🔥 Burn:             ${burnTokens.toLocaleString()} (${SPLIT.burn}%)`);

  // ═══ STEP 1: Create Token-2022 mint ═══
  console.log('\n   Step 1: Creating Token-2022 mint with metadata extension...');
  const createOut = cli(
    `spl-token create-token --enable-metadata --decimals ${DECIMALS} ` +
    `--fee-payer ${KEYPAIR_PATH} ` +
    `--program-id ${TOKEN_2022_PROGRAM} 2>&1`
  );
  
  const mintMatch = createOut.match(/Address:\s+([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (!mintMatch) throw new Error(`Failed to parse mint address from: ${createOut}`);
  const mint = mintMatch[1];
  console.log(`   Mint: ${mint}`);

  // ═══ STEP 2: Write metadata JSON ═══
  const metadataJson = {
    name,
    symbol,
    description: description || `${name} — created on ClawdNation`,
    image: image || `${METADATA_BASE_URL}/logo.jpg`,
    external_url: METADATA_BASE_URL,
    attributes: [],
    properties: {
      category: 'currency',
      creators: [{ address: recipientAddr, share: 100 }],
      tokenomics: {
        liquidity: `${SPLIT.liquidity}%`,
        creator: `${SPLIT.creator}% (12m linear vest)`,
        treasury: `${SPLIT.treasury}%`,
        burn: `${SPLIT.burn}%`,
      }
    }
  };

  const metaFilename = `token-meta-${mint.slice(0, 8)}.json`;
  const metaPath = path.join('/opt/clawdnation', metaFilename);
  fs.writeFileSync(metaPath, JSON.stringify(metadataJson, null, 2));
  const metaUri = `${METADATA_BASE_URL}/${metaFilename}`;
  console.log(`   Metadata URI: ${metaUri}`);

  // ═══ STEP 3: Initialize metadata ═══
  console.log('\n   Step 2: Initializing metadata...');
  const safeName = name.replace(/'/g, "'\\''");
  const safeSymbol = symbol.replace(/'/g, "'\\''");
  cli(
    `spl-token initialize-metadata ${mint} '${safeName}' '${safeSymbol}' '${metaUri}' ` +
    `--fee-payer ${KEYPAIR_PATH} 2>&1`
  );
  console.log('   Metadata initialized ✅');

  // ═══ STEP 4: Create token account for authority & mint full supply ═══
  console.log('\n   Step 3: Creating token account for authority...');
  const acctOut = cli(
    `spl-token create-account ${mint} --fee-payer ${KEYPAIR_PATH} 2>&1`
  );
  const acctMatch = acctOut.match(/Creating account\s+([1-9A-HJ-NP-Za-km-z]{32,44})/);
  const tokenAccount = acctMatch ? acctMatch[1] : 'unknown';
  console.log(`   Token account: ${tokenAccount}`);

  console.log('\n   Step 4: Minting full supply to authority...');
  cli(`spl-token mint ${mint} ${supply} --fee-payer ${KEYPAIR_PATH} 2>&1`);
  console.log('   Supply minted ✅');

  // ═══ STEP 5: BURN 10% ═══
  console.log(`\n   Step 5: Burning ${burnTokens.toLocaleString()} tokens (${SPLIT.burn}%)... 🔥`);
  cli(`spl-token burn ${tokenAccount} ${burnTokens} --fee-payer ${KEYPAIR_PATH} 2>&1`);
  console.log('   Burn complete ✅ 🔥');

  // ═══ STEP 6: Treasury stays in authority wallet (already there) ═══
  console.log(`\n   Step 6: Treasury — ${treasuryTokens.toLocaleString()} tokens remain in authority wallet 🏦`);

  // ═══ STEP 7: Creator vesting — hold in authority, track in vesting.json ═══
  console.log(`\n   Step 7: Creator vesting — ${creatorTokens.toLocaleString()} tokens tracked for ${recipientAddr}`);
  addVestingEntry(mint, {
    creator: recipientAddr,
    totalTokens: creatorTokens,
    symbol,
    name,
  });

  const result = {
    mint,
    name,
    symbol,
    supply,
    decimals: DECIMALS,
    creator: recipientAddr,
    tokenAccount,
    metadataUri: metaUri,
    explorer: `https://explorer.solana.com/address/${mint}?cluster=devnet`,
    program: TOKEN_2022_PROGRAM,
    tokenomics: {
      liquidityTokens,
      creatorTokens,
      treasuryTokens,
      burnedTokens: burnTokens,
      creatorVesting: '12 months linear',
    },
    pool: null,
  };

  console.log('\n✅ Token created with tokenomics!');

  // ═══ STEP 8: Create Raydium CPMM pool with 70% ═══
  const skipPool = process.env.SKIP_POOL === '1' || process.env.SKIP_POOL === 'true';
  if (!skipPool) {
    try {
      console.log(`\n   Step 8: Creating Raydium CPMM pool with ${liquidityTokens.toLocaleString()} tokens (${SPLIT.liquidity}%)...`);
      // Convert to smallest units (with decimals)
      const poolTokenAmount = String(BigInt(liquidityTokens) * BigInt(10 ** DECIMALS));
      const poolSolAmount = solForPool || POOL_SOL_AMOUNT;
      console.log(`   Pool: ${liquidityTokens.toLocaleString()} tokens + ${Number(poolSolAmount) / 1e9} SOL`);
      
      const poolResult = await createPool(mint, poolTokenAmount, poolSolAmount);
      result.pool = {
        poolId: poolResult.poolId,
        txId: poolResult.txId,
        tokenAmount: liquidityTokens,
        solAmount: Number(poolSolAmount) / 1e9,
        explorer: poolResult.poolExplorer,
      };
      console.log('   Pool created ✅ 💧');
    } catch (e) {
      console.error(`   ⚠️ Pool creation failed: ${e.message}`);
      console.error('   Token was created successfully, but pool was not.');
      result.poolError = e.message;
    }
  }

  // ═══ SUMMARY ═══
  console.log('\n══════════════════════════════════════');
  console.log(`  ✅ ${name} ($${symbol}) LAUNCHED`);
  console.log(`  Mint: ${mint}`);
  console.log(`  🔥 Burned: ${burnTokens.toLocaleString()}`);
  console.log(`  🏦 Treasury: ${treasuryTokens.toLocaleString()}`);
  console.log(`  👤 Creator (vested 12m): ${creatorTokens.toLocaleString()}`);
  console.log(`  💧 Liquidity Pool: ${liquidityTokens.toLocaleString()}`);
  if (result.pool) console.log(`  🏊 Pool: ${result.pool.poolId}`);
  console.log('══════════════════════════════════════\n');

  console.log(JSON.stringify(result, null, 2));
  return result;
}

// ═══ VESTING CLAIM FUNCTION ═══
async function claimVesting(mint, claimerAddress) {
  const vesting = loadVesting();
  const entry = vesting[mint];
  if (!entry) throw new Error(`No vesting found for mint ${mint}`);
  if (entry.creator !== claimerAddress) throw new Error(`Not the creator. Expected ${entry.creator}`);

  const now = new Date();
  const start = new Date(entry.startDate);
  const monthsElapsed = Math.floor((now - start) / (30 * 24 * 60 * 60 * 1000));
  
  if (monthsElapsed < 1) throw new Error('Vesting not started yet — first unlock is 1 month after creation');

  const unlockedMonths = Math.min(monthsElapsed, entry.vestingMonths);
  const totalUnlocked = unlockedMonths * entry.monthlyUnlock;
  const claimable = totalUnlocked - entry.claimedTokens;

  if (claimable <= 0) throw new Error(`Nothing to claim yet. Next unlock in ${30 - ((now - start) / (24*60*60*1000)) % 30 | 0} days`);

  console.log(`💰 Claiming ${claimable.toLocaleString()} ${entry.symbol} for ${claimerAddress}`);
  console.log(`   Months elapsed: ${monthsElapsed}/${entry.vestingMonths}`);
  console.log(`   Total unlocked: ${totalUnlocked.toLocaleString()}`);
  console.log(`   Previously claimed: ${entry.claimedTokens.toLocaleString()}`);
  console.log(`   This claim: ${claimable.toLocaleString()}`);

  // Transfer tokens from authority to creator
  cli(
    `spl-token transfer ${mint} ${claimable} ${claimerAddress} ` +
    `--fee-payer ${KEYPAIR_PATH} --fund-recipient 2>&1`
  );

  // Update vesting record
  entry.claimedTokens += claimable;
  entry.lastClaim = now.toISOString();
  entry.claimCount += 1;
  saveVesting(vesting);

  console.log(`✅ Claimed ${claimable.toLocaleString()} ${entry.symbol}`);
  return {
    claimed: claimable,
    totalClaimed: entry.claimedTokens,
    remaining: entry.totalTokens - entry.claimedTokens,
    nextUnlock: unlockedMonths < entry.vestingMonths ? new Date(start.getTime() + (unlockedMonths + 1) * 30 * 24 * 60 * 60 * 1000).toISOString() : null,
  };
}

// CLI mode
if (require.main === module) {
  const args = parseArgs();
  
  if (args.claim) {
    // Claim mode: node token-factory.js --claim <mint> --wallet <address>
    claimVesting(args.claim, args.wallet).then(r => {
      console.log(JSON.stringify(r, null, 2));
    }).catch(e => { console.error('Claim error:', e.message); process.exit(1); });
  } else {
    if (!args.name || !args.symbol) {
      console.error('Usage:');
      console.error('  Create: node token-factory.js --name "Name" --symbol "SYM" [--description "..."] [--recipient "addr"]');
      console.error('  Claim:  node token-factory.js --claim <mint> --wallet <address>');
      process.exit(1);
    }
    createToken(args).catch(e => { console.error('Error:', e.message); process.exit(1); });
  }
}

module.exports = { createToken, claimVesting, loadVesting, SPLIT };
