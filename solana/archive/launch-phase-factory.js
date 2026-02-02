/**
 * CLWDN Launch Phase Factory
 *
 * Distributes 100M CLWDN (10% of supply) via Twitter/X:
 * - 50M: Tweet-to-Claim (50K users × 1K CLWDN)
 * - 30M: Create & Earn (10K creators × 3K CLWDN)
 * - 10M: Referrals (20K referrals × 500 CLWDN)
 * - 10M: Community contests (manual)
 *
 * Uses the SAME distribution pattern as factory tokenomics!
 */

const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const LAUNCH_DATA_PATH = path.join(__dirname, 'launch-phase-data.json');

// Authority keypair (holds launch allocation)
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

console.log('🚀 CLWDN Launch Phase Factory');
console.log('Authority:', authority.publicKey.toBase58());
console.log('CLWDN Mint:', CLWDN_MINT.toBase58());

// ═══════════════════════════════════════════════════════
// LAUNCH PHASE ALLOCATIONS (10% = 100M CLWDN)
// ═══════════════════════════════════════════════════════

const ALLOCATIONS = {
  tweetToClaim: {
    name: 'Tweet-to-Claim',
    total: 50_000_000,        // 50M CLWDN
    perUser: 1_000,            // 1K CLWDN per tweet
    maxUsers: 50_000,          // First 50K users
    claimed: 0,
    claimants: [],
  },
  createAndEarn: {
    name: 'Create & Earn',
    total: 30_000_000,        // 30M CLWDN
    perCreator: 3_000,         // 3K CLWDN per token created
    maxCreators: 10_000,       // First 10K creators
    claimed: 0,
    claimants: [],
  },
  referrals: {
    name: 'Referral Rewards',
    total: 10_000_000,        // 10M CLWDN
    perReferral: 500,          // 500 CLWDN per referral
    maxReferrals: 20_000,      // Max 20K referrals
    claimed: 0,
    claimants: [],
  },
  contests: {
    name: 'Community Contests',
    total: 10_000_000,        // 10M CLWDN
    manual: true,              // Manual distribution by team
    claimed: 0,
    distributions: [],
  },
};

// ═══════════════════════════════════════════════════════
// DATA MANAGEMENT
// ═══════════════════════════════════════════════════════

function loadLaunchData() {
  try {
    if (fs.existsSync(LAUNCH_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(LAUNCH_DATA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading launch data:', e.message);
  }
  return {
    allocations: JSON.parse(JSON.stringify(ALLOCATIONS)), // Deep copy
    metadata: {
      mint: CLWDN_MINT.toBase58(),
      authority: authority.publicKey.toBase58(),
      launchDate: new Date().toISOString(),
      network: RPC.includes('devnet') ? 'devnet' : 'mainnet',
    },
  };
}

function saveLaunchData(data) {
  data.metadata.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LAUNCH_DATA_PATH, JSON.stringify(data, null, 2));
  console.log(`✅ Launch data saved: ${LAUNCH_DATA_PATH}`);
}

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

function initializeLaunchPhase() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Initializing CLWDN Launch Phase');
  console.log('═══════════════════════════════════════════════════════\n');

  const existing = loadLaunchData();
  if (existing.allocations.tweetToClaim.claimants.length > 0) {
    console.log('⚠️  Launch phase already initialized!');
    console.log(`   Found ${existing.allocations.tweetToClaim.claimants.length} existing claims.`);
    return existing;
  }

  const data = loadLaunchData();

  console.log('📋 LAUNCH PHASE ALLOCATIONS:');
  console.log('');
  console.log(`1️⃣  Tweet-to-Claim:`);
  console.log(`   Total: ${ALLOCATIONS.tweetToClaim.total.toLocaleString()} CLWDN (50%)`);
  console.log(`   Per user: ${ALLOCATIONS.tweetToClaim.perUser.toLocaleString()} CLWDN`);
  console.log(`   Max users: ${ALLOCATIONS.tweetToClaim.maxUsers.toLocaleString()}`);
  console.log('');

  console.log(`2️⃣  Create & Earn:`);
  console.log(`   Total: ${ALLOCATIONS.createAndEarn.total.toLocaleString()} CLWDN (30%)`);
  console.log(`   Per creator: ${ALLOCATIONS.createAndEarn.perCreator.toLocaleString()} CLWDN`);
  console.log(`   Max creators: ${ALLOCATIONS.createAndEarn.maxCreators.toLocaleString()}`);
  console.log('');

  console.log(`3️⃣  Referral Rewards:`);
  console.log(`   Total: ${ALLOCATIONS.referrals.total.toLocaleString()} CLWDN (10%)`);
  console.log(`   Per referral: ${ALLOCATIONS.referrals.perReferral.toLocaleString()} CLWDN`);
  console.log(`   Max referrals: ${ALLOCATIONS.referrals.maxReferrals.toLocaleString()}`);
  console.log('');

  console.log(`4️⃣  Community Contests:`);
  console.log(`   Total: ${ALLOCATIONS.contests.total.toLocaleString()} CLWDN (10%)`);
  console.log(`   Distribution: Manual by team`);
  console.log('');

  console.log(`📊 TOTAL LAUNCH ALLOCATION: 100,000,000 CLWDN (10% of supply)`);

  saveLaunchData(data);

  console.log('\n✅ Launch phase initialized!');
  return data;
}

// ═══════════════════════════════════════════════════════
// TWEET-TO-CLAIM
// ═══════════════════════════════════════════════════════

async function claimTweet(walletAddress, twitterHandle, tweetId) {
  console.log(`\n💬 Processing Tweet-to-Claim:`);
  console.log(`   Twitter: @${twitterHandle}`);
  console.log(`   Wallet: ${walletAddress}`);
  console.log(`   Tweet: https://twitter.com/${twitterHandle}/status/${tweetId}`);

  const data = loadLaunchData();
  const allocation = data.allocations.tweetToClaim;

  // Check if campaign is full
  if (allocation.claimants.length >= allocation.maxUsers) {
    throw new Error(`❌ Tweet-to-Claim is full! ${allocation.maxUsers} users already claimed.`);
  }

  // Check if wallet already claimed
  if (allocation.claimants.find(c => c.wallet === walletAddress)) {
    throw new Error(`❌ Wallet ${walletAddress} already claimed!`);
  }

  // Check if Twitter handle already claimed
  if (allocation.claimants.find(c => c.twitter === twitterHandle)) {
    throw new Error(`❌ Twitter @${twitterHandle} already claimed!`);
  }

  // Calculate remaining
  const remaining = allocation.maxUsers - allocation.claimants.length;
  console.log(`   Remaining slots: ${remaining.toLocaleString()}`);

  // Transfer CLWDN
  const amount = allocation.perUser;
  console.log(`   Transferring ${amount.toLocaleString()} CLWDN...`);

  const fromTokenAccount = await getAssociatedTokenAddress(
    CLWDN_MINT,
    authority.publicKey
  );

  const toTokenAccount = await getAssociatedTokenAddress(
    CLWDN_MINT,
    new PublicKey(walletAddress)
  );

  const amountWithDecimals = BigInt(amount) * BigInt(10 ** 9);

  const transferIx = createTransferInstruction(
    fromTokenAccount,
    toTokenAccount,
    authority.publicKey,
    amountWithDecimals,
    [],
    TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(transferIx);
  const sig = await conn.sendTransaction(tx, [authority]);
  await conn.confirmTransaction(sig);

  console.log(`   ✅ Transfer complete! Signature: ${sig}`);

  // Record claim
  allocation.claimants.push({
    wallet: walletAddress,
    twitter: twitterHandle,
    tweetId,
    amount,
    timestamp: new Date().toISOString(),
    txSignature: sig,
  });
  allocation.claimed += amount;

  saveLaunchData(data);

  console.log(`\n🎉 @${twitterHandle} claimed ${amount.toLocaleString()} CLWDN!`);
  console.log(`   Total claimed: ${allocation.claimed.toLocaleString()} / ${allocation.total.toLocaleString()} CLWDN`);
  console.log(`   Claimants: ${allocation.claimants.length} / ${allocation.maxUsers}`);

  return {
    success: true,
    amount,
    txSignature: sig,
    remaining: allocation.maxUsers - allocation.claimants.length,
    totalClaimed: allocation.claimed,
  };
}

// ═══════════════════════════════════════════════════════
// CREATE & EARN
// ═══════════════════════════════════════════════════════

async function claimCreateEarn(walletAddress, tokenMint, tokenSymbol) {
  console.log(`\n🏭 Processing Create & Earn:`);
  console.log(`   Creator: ${walletAddress}`);
  console.log(`   Token: $${tokenSymbol} (${tokenMint})`);

  const data = loadLaunchData();
  const allocation = data.allocations.createAndEarn;

  // Check if campaign is full
  if (allocation.claimants.length >= allocation.maxCreators) {
    throw new Error(`❌ Create & Earn is full! ${allocation.maxCreators} creators already claimed.`);
  }

  // Check if wallet already claimed
  if (allocation.claimants.find(c => c.wallet === walletAddress)) {
    throw new Error(`❌ Wallet ${walletAddress} already claimed Create & Earn!`);
  }

  // Check if token already claimed (prevent double-claiming same token)
  if (allocation.claimants.find(c => c.tokenMint === tokenMint)) {
    throw new Error(`❌ Token ${tokenMint} already used for claim!`);
  }

  const remaining = allocation.maxCreators - allocation.claimants.length;
  console.log(`   Remaining slots: ${remaining.toLocaleString()}`);

  // Transfer CLWDN
  const amount = allocation.perCreator;
  console.log(`   Transferring ${amount.toLocaleString()} CLWDN...`);

  const fromTokenAccount = await getAssociatedTokenAddress(
    CLWDN_MINT,
    authority.publicKey
  );

  const toTokenAccount = await getAssociatedTokenAddress(
    CLWDN_MINT,
    new PublicKey(walletAddress)
  );

  const amountWithDecimals = BigInt(amount) * BigInt(10 ** 9);

  const transferIx = createTransferInstruction(
    fromTokenAccount,
    toTokenAccount,
    authority.publicKey,
    amountWithDecimals,
    [],
    TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(transferIx);
  const sig = await conn.sendTransaction(tx, [authority]);
  await conn.confirmTransaction(sig);

  console.log(`   ✅ Transfer complete! Signature: ${sig}`);

  // Record claim
  allocation.claimants.push({
    wallet: walletAddress,
    tokenMint,
    tokenSymbol,
    amount,
    timestamp: new Date().toISOString(),
    txSignature: sig,
  });
  allocation.claimed += amount;

  saveLaunchData(data);

  console.log(`\n🎉 Creator earned ${amount.toLocaleString()} CLWDN for creating $${tokenSymbol}!`);
  console.log(`   Total claimed: ${allocation.claimed.toLocaleString()} / ${allocation.total.toLocaleString()} CLWDN`);
  console.log(`   Creators: ${allocation.claimants.length} / ${allocation.maxCreators}`);

  return {
    success: true,
    amount,
    txSignature: sig,
    remaining: allocation.maxCreators - allocation.claimants.length,
    totalClaimed: allocation.claimed,
  };
}

// ═══════════════════════════════════════════════════════
// STATUS & STATS
// ═══════════════════════════════════════════════════════

function viewStatus() {
  const data = loadLaunchData();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   CLWDN Launch Phase Status');
  console.log('═══════════════════════════════════════════════════════\n');

  // Tweet-to-Claim
  const tweet = data.allocations.tweetToClaim;
  console.log(`1️⃣  TWEET-TO-CLAIM`);
  console.log(`   Total allocation: ${tweet.total.toLocaleString()} CLWDN`);
  console.log(`   Claimed: ${tweet.claimed.toLocaleString()} CLWDN (${((tweet.claimed / tweet.total) * 100).toFixed(1)}%)`);
  console.log(`   Claimants: ${tweet.claimants.length} / ${tweet.maxUsers}`);
  console.log(`   Remaining: ${(tweet.total - tweet.claimed).toLocaleString()} CLWDN`);
  console.log(`   Slots left: ${tweet.maxUsers - tweet.claimants.length}`);
  console.log('');

  // Create & Earn
  const create = data.allocations.createAndEarn;
  console.log(`2️⃣  CREATE & EARN`);
  console.log(`   Total allocation: ${create.total.toLocaleString()} CLWDN`);
  console.log(`   Claimed: ${create.claimed.toLocaleString()} CLWDN (${((create.claimed / create.total) * 100).toFixed(1)}%)`);
  console.log(`   Creators: ${create.claimants.length} / ${create.maxCreators}`);
  console.log(`   Remaining: ${(create.total - create.claimed).toLocaleString()} CLWDN`);
  console.log(`   Slots left: ${create.maxCreators - create.claimants.length}`);
  console.log('');

  // Referrals
  const ref = data.allocations.referrals;
  console.log(`3️⃣  REFERRAL REWARDS`);
  console.log(`   Total allocation: ${ref.total.toLocaleString()} CLWDN`);
  console.log(`   Claimed: ${ref.claimed.toLocaleString()} CLWDN (${((ref.claimed / ref.total) * 100).toFixed(1)}%)`);
  console.log(`   Referrals: ${ref.claimants.length} / ${ref.maxReferrals}`);
  console.log(`   Remaining: ${(ref.total - ref.claimed).toLocaleString()} CLWDN`);
  console.log('');

  // Contests
  const contest = data.allocations.contests;
  console.log(`4️⃣  COMMUNITY CONTESTS`);
  console.log(`   Total allocation: ${contest.total.toLocaleString()} CLWDN`);
  console.log(`   Distributed: ${contest.claimed.toLocaleString()} CLWDN (${((contest.claimed / contest.total) * 100).toFixed(1)}%)`);
  console.log(`   Distributions: ${contest.distributions.length}`);
  console.log(`   Remaining: ${(contest.total - contest.claimed).toLocaleString()} CLWDN`);
  console.log('');

  // Total
  const totalClaimed = tweet.claimed + create.claimed + ref.claimed + contest.claimed;
  const totalAllocation = 100_000_000;
  console.log(`📊 TOTAL LAUNCH PHASE:`);
  console.log(`   Total allocation: ${totalAllocation.toLocaleString()} CLWDN (10% of supply)`);
  console.log(`   Claimed: ${totalClaimed.toLocaleString()} CLWDN (${((totalClaimed / totalAllocation) * 100).toFixed(1)}%)`);
  console.log(`   Remaining: ${(totalAllocation - totalClaimed).toLocaleString()} CLWDN`);
  console.log(`   Total participants: ${tweet.claimants.length + create.claimants.length + ref.claimants.length}`);

  console.log(`\nLaunched: ${data.metadata.launchDate}`);
  console.log(`Network: ${data.metadata.network}`);
}

// ═══════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace('--', '');
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      if (args[key] !== true) i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  if (args.init || args.initialize) {
    initializeLaunchPhase();
  } else if (args.status || args.view) {
    viewStatus();
  } else if (args['claim-tweet']) {
    const wallet = args.wallet;
    const twitter = args.twitter;
    const tweetId = args['claim-tweet'];

    if (!wallet || !twitter) {
      console.error('❌ Usage: --claim-tweet <tweet_id> --wallet <address> --twitter <handle>');
      process.exit(1);
    }

    const result = await claimTweet(wallet, twitter, tweetId);
    console.log('\n' + JSON.stringify(result, null, 2));
  } else if (args['claim-create']) {
    const wallet = args.wallet;
    const mint = args['claim-create'];
    const symbol = args.symbol;

    if (!wallet || !symbol) {
      console.error('❌ Usage: --claim-create <token_mint> --wallet <address> --symbol <symbol>');
      process.exit(1);
    }

    const result = await claimCreateEarn(wallet, mint, symbol);
    console.log('\n' + JSON.stringify(result, null, 2));
  } else {
    console.log(`
CLWDN Launch Phase Factory

Distributes 100M CLWDN (10%) via Twitter/X launch campaign.

Usage:
  Initialize:   node launch-phase-factory.js --init
  View status:  node launch-phase-factory.js --status

  Claim tweet:  node launch-phase-factory.js --claim-tweet <tweet_id> --wallet <addr> --twitter <handle>
  Claim create: node launch-phase-factory.js --claim-create <mint> --wallet <addr> --symbol <symbol>

Examples:
  node launch-phase-factory.js --init
  node launch-phase-factory.js --status
  node launch-phase-factory.js --claim-tweet 1234567890 --wallet 6PdE...T7H --twitter johndoe
  node launch-phase-factory.js --claim-create 2poZ...Vs3 --wallet 6PdE...T7H --symbol MYTOKEN
    `);
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  });
}

module.exports = { initializeLaunchPhase, claimTweet, claimCreateEarn, viewStatus, loadLaunchData, ALLOCATIONS };
