/**
 * CLWDN Vesting Factory
 *
 * Uses the SAME approach as token-factory.js to manage CLWDN distribution:
 * - Team allocation: 150M CLWDN (2-year linear vesting)
 * - Staking rewards: 150M CLWDN (4-year linear vesting)
 * - Community airdrops: 100M CLWDN (manual distribution)
 *
 * Why this approach?
 * - Same proven system used for factory tokens
 * - Simple off-chain tracking
 * - Gas-efficient claims
 * - No complex on-chain vesting contracts
 * - Easy to audit (just read vesting.json)
 */

const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const CLWDN_MINT = new PublicKey('2y6QBET7YTqwzgHBeTUkKA791npyLxh9KXkUZTPjQmNx');
const VESTING_PATH = path.join(__dirname, 'clwdn-vesting.json');

// Authority keypair (holds all unvested tokens)
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

console.log('Authority:', authority.publicKey.toBase58());
console.log('CLWDN Mint:', CLWDN_MINT.toBase58());

// ═══════════════════════════════════════════════════════
// CLWDN TOKENOMICS (from skill.md)
// ═══════════════════════════════════════════════════════
const TOKENOMICS = {
  bootstrap: {
    amount: 200_000_000, // 20%
    description: 'Bootstrap sale (1 SOL = 10,000 CLWDN)',
    vesting: 'Immediate upon distribution',
  },
  liquidity: {
    amount: 250_000_000, // 25%
    description: 'Liquidity pool (CLWDN/SOL)',
    vesting: 'Immediate (LP creation)',
  },
  staking: {
    amount: 150_000_000, // 15%
    description: 'Staking rewards',
    vesting: '4 years linear (1/48th per month)',
  },
  team: {
    amount: 150_000_000, // 15%
    description: 'Team allocation',
    vesting: '2 years linear (1/24th per month)',
  },
  community: {
    amount: 100_000_000, // 10%
    description: 'Community & airdrops',
    vesting: 'Manual distribution',
  },
  treasury: {
    amount: 100_000_000, // 10%
    description: 'Treasury reserves',
    vesting: 'Governance controlled',
  },
  development: {
    amount: 50_000_000, // 5%
    description: 'Development fund',
    vesting: 'As needed',
  },
};

// ═══════════════════════════════════════════════════════
// VESTING MANAGEMENT (Same as token-factory.js)
// ═══════════════════════════════════════════════════════

function loadVesting() {
  try {
    if (fs.existsSync(VESTING_PATH)) {
      return JSON.parse(fs.readFileSync(VESTING_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading vesting file:', e.message);
  }
  return { allocations: [], metadata: { createdAt: new Date().toISOString() } };
}

function saveVesting(data) {
  data.metadata = data.metadata || {};
  data.metadata.lastUpdated = new Date().toISOString();
  fs.writeFileSync(VESTING_PATH, JSON.stringify(data, null, 2));
  console.log(`✅ Vesting file saved: ${VESTING_PATH}`);
}

/**
 * Create vesting allocations for CLWDN distribution
 */
function initializeClwdnVesting() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Initializing CLWDN Vesting Factory');
  console.log('═══════════════════════════════════════════════════════\n');

  const existing = loadVesting();
  if (existing.allocations && existing.allocations.length > 0) {
    console.log('⚠️  Vesting allocations already exist!');
    console.log(`   Found ${existing.allocations.length} existing allocations.`);
    console.log('   Use --force to overwrite.');
    return existing;
  }

  const allocations = [];

  // ═══ TEAM VESTING (2 years = 24 months) ═══
  console.log('📋 Creating TEAM allocation:');
  console.log(`   Amount: ${TOKENOMICS.team.amount.toLocaleString()} CLWDN`);
  console.log(`   Vesting: 2 years (24 months) linear`);
  console.log(`   Unlock: ${(TOKENOMICS.team.amount / 24).toLocaleString()} CLWDN per month`);

  allocations.push({
    id: 'team',
    category: 'Team',
    recipient: authority.publicKey.toBase58(), // Change to actual team multi-sig
    totalAmount: TOKENOMICS.team.amount,
    claimedAmount: 0,
    vestingMonths: 24,
    monthlyUnlock: Math.floor(TOKENOMICS.team.amount / 24),
    startDate: new Date().toISOString(),
    lastClaim: null,
    claimCount: 0,
    description: TOKENOMICS.team.description,
    status: 'active',
  });

  // ═══ STAKING REWARDS (4 years = 48 months) ═══
  console.log('\n📋 Creating STAKING REWARDS allocation:');
  console.log(`   Amount: ${TOKENOMICS.staking.amount.toLocaleString()} CLWDN`);
  console.log(`   Vesting: 4 years (48 months) linear`);
  console.log(`   Unlock: ${(TOKENOMICS.staking.amount / 48).toLocaleString()} CLWDN per month`);

  allocations.push({
    id: 'staking',
    category: 'Staking Rewards',
    recipient: authority.publicKey.toBase58(), // Staking program will claim from this
    totalAmount: TOKENOMICS.staking.amount,
    claimedAmount: 0,
    vestingMonths: 48,
    monthlyUnlock: Math.floor(TOKENOMICS.staking.amount / 48),
    startDate: new Date().toISOString(),
    lastClaim: null,
    claimCount: 0,
    description: TOKENOMICS.staking.description,
    status: 'active',
  });

  // ═══ COMMUNITY AIRDROPS (manual, no vesting) ═══
  console.log('\n📋 Creating COMMUNITY allocation:');
  console.log(`   Amount: ${TOKENOMICS.community.amount.toLocaleString()} CLWDN`);
  console.log(`   Vesting: Manual distribution (no time lock)`);

  allocations.push({
    id: 'community',
    category: 'Community & Airdrops',
    recipient: authority.publicKey.toBase58(), // Manual distribution by governance
    totalAmount: TOKENOMICS.community.amount,
    claimedAmount: 0,
    vestingMonths: 0, // No vesting
    monthlyUnlock: 0,
    startDate: new Date().toISOString(),
    lastClaim: null,
    claimCount: 0,
    description: TOKENOMICS.community.description,
    status: 'active',
  });

  // ═══ TREASURY (governance controlled) ═══
  console.log('\n📋 Creating TREASURY allocation:');
  console.log(`   Amount: ${TOKENOMICS.treasury.amount.toLocaleString()} CLWDN`);
  console.log(`   Vesting: Governance proposals only`);

  allocations.push({
    id: 'treasury',
    category: 'Treasury',
    recipient: authority.publicKey.toBase58(), // Governance multi-sig
    totalAmount: TOKENOMICS.treasury.amount,
    claimedAmount: 0,
    vestingMonths: 0, // No time vesting, governance controlled
    monthlyUnlock: 0,
    startDate: new Date().toISOString(),
    lastClaim: null,
    claimCount: 0,
    description: TOKENOMICS.treasury.description,
    status: 'active',
  });

  // ═══ DEVELOPMENT (as needed) ═══
  console.log('\n📋 Creating DEVELOPMENT allocation:');
  console.log(`   Amount: ${TOKENOMICS.development.amount.toLocaleString()} CLWDN`);
  console.log(`   Vesting: As needed for development costs`);

  allocations.push({
    id: 'development',
    category: 'Development',
    recipient: authority.publicKey.toBase58(), // Dev fund wallet
    totalAmount: TOKENOMICS.development.amount,
    claimedAmount: 0,
    vestingMonths: 0,
    monthlyUnlock: 0,
    startDate: new Date().toISOString(),
    lastClaim: null,
    claimCount: 0,
    description: TOKENOMICS.development.description,
    status: 'active',
  });

  const vestingData = {
    allocations,
    metadata: {
      mint: CLWDN_MINT.toBase58(),
      authority: authority.publicKey.toBase58(),
      createdAt: new Date().toISOString(),
      network: RPC.includes('devnet') ? 'devnet' : 'mainnet',
      totalAllocated: allocations.reduce((sum, a) => sum + a.totalAmount, 0),
    },
  };

  saveVesting(vestingData);

  console.log('\n✅ CLWDN vesting factory initialized!');
  console.log(`   Total allocated: ${vestingData.metadata.totalAllocated.toLocaleString()} CLWDN`);
  console.log(`   Allocations: ${allocations.length}`);

  return vestingData;
}

/**
 * Claim vested tokens (same logic as token-factory.js)
 */
async function claimVesting(allocationId, claimerAddress) {
  console.log(`\n💰 Claiming vesting for: ${allocationId}`);

  const vesting = loadVesting();
  const allocation = vesting.allocations.find(a => a.id === allocationId);

  if (!allocation) {
    throw new Error(`Allocation not found: ${allocationId}`);
  }

  // Verify claimer (in production, check governance approval)
  if (allocation.recipient !== claimerAddress) {
    console.log(`⚠️  Claimer ${claimerAddress} is not the recipient ${allocation.recipient}`);
    console.log('   This would require governance approval in production.');
  }

  // Calculate vested amount
  const now = new Date();
  const start = new Date(allocation.startDate);
  const monthsElapsed = Math.floor((now - start) / (30 * 24 * 60 * 60 * 1000));

  // No vesting = manual claim
  if (allocation.vestingMonths === 0) {
    console.log(`   ⚠️  ${allocation.category} has no time vesting.`);
    console.log('   Manual distribution requires governance approval.');
    throw new Error('No time-based vesting for this allocation');
  }

  if (monthsElapsed < 1) {
    throw new Error(`Vesting cliff not reached. First unlock in ${30 - Math.floor((now - start) / (24*60*60*1000))} days`);
  }

  const unlockedMonths = Math.min(monthsElapsed, allocation.vestingMonths);
  const totalUnlocked = unlockedMonths * allocation.monthlyUnlock;
  const claimable = totalUnlocked - allocation.claimedAmount;

  if (claimable <= 0) {
    const daysToNext = 30 - (Math.floor((now - start) / (24*60*60*1000)) % 30);
    throw new Error(`Nothing to claim. Next unlock in ${daysToNext} days`);
  }

  console.log(`   Category: ${allocation.category}`);
  console.log(`   Progress: ${monthsElapsed}/${allocation.vestingMonths} months`);
  console.log(`   Total unlocked: ${totalUnlocked.toLocaleString()} CLWDN`);
  console.log(`   Previously claimed: ${allocation.claimedAmount.toLocaleString()} CLWDN`);
  console.log(`   Claimable now: ${claimable.toLocaleString()} CLWDN`);

  // Get token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(
    CLWDN_MINT,
    authority.publicKey
  );

  const toTokenAccount = await getAssociatedTokenAddress(
    CLWDN_MINT,
    new PublicKey(claimerAddress)
  );

  console.log(`\n   Transferring from authority: ${fromTokenAccount.toBase58()}`);
  console.log(`   To recipient: ${toTokenAccount.toBase58()}`);

  // Transfer tokens (with decimals)
  const amountWithDecimals = BigInt(claimable) * BigInt(10 ** 9); // CLWDN has 9 decimals

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

  // Update vesting record
  allocation.claimedAmount += claimable;
  allocation.lastClaim = now.toISOString();
  allocation.claimCount += 1;

  if (allocation.claimedAmount >= allocation.totalAmount) {
    allocation.status = 'completed';
    console.log('   🎉 Vesting fully claimed!');
  }

  saveVesting(vesting);

  const nextUnlockDate = unlockedMonths < allocation.vestingMonths
    ? new Date(start.getTime() + (unlockedMonths + 1) * 30 * 24 * 60 * 60 * 1000)
    : null;

  return {
    allocation: allocation.id,
    category: allocation.category,
    claimed: claimable,
    totalClaimed: allocation.claimedAmount,
    remaining: allocation.totalAmount - allocation.claimedAmount,
    progress: `${unlockedMonths}/${allocation.vestingMonths} months`,
    nextUnlock: nextUnlockDate ? nextUnlockDate.toISOString() : 'Completed',
    txSignature: sig,
  };
}

/**
 * View vesting status
 */
function viewVesting(allocationId) {
  const vesting = loadVesting();

  if (!vesting.allocations || vesting.allocations.length === 0) {
    console.log('❌ No vesting allocations found. Run --init first.');
    return;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   CLWDN Vesting Status');
  console.log('═══════════════════════════════════════════════════════\n');

  const allocations = allocationId
    ? vesting.allocations.filter(a => a.id === allocationId)
    : vesting.allocations;

  const now = new Date();

  allocations.forEach(allocation => {
    console.log(`📊 ${allocation.category.toUpperCase()} (${allocation.id})`);
    console.log(`   Total: ${allocation.totalAmount.toLocaleString()} CLWDN`);
    console.log(`   Claimed: ${allocation.claimedAmount.toLocaleString()} CLWDN`);
    console.log(`   Remaining: ${(allocation.totalAmount - allocation.claimedAmount).toLocaleString()} CLWDN`);

    if (allocation.vestingMonths > 0) {
      const start = new Date(allocation.startDate);
      const monthsElapsed = Math.floor((now - start) / (30 * 24 * 60 * 60 * 1000));
      const unlockedMonths = Math.min(monthsElapsed, allocation.vestingMonths);
      const totalUnlocked = unlockedMonths * allocation.monthlyUnlock;
      const claimable = totalUnlocked - allocation.claimedAmount;

      console.log(`   Vesting: ${allocation.vestingMonths} months (${(allocation.monthlyUnlock).toLocaleString()} CLWDN/month)`);
      console.log(`   Progress: ${unlockedMonths}/${allocation.vestingMonths} months`);
      console.log(`   Unlocked: ${totalUnlocked.toLocaleString()} CLWDN`);
      console.log(`   Claimable: ${Math.max(0, claimable).toLocaleString()} CLWDN`);
    } else {
      console.log(`   Vesting: Manual distribution (governance controlled)`);
    }

    console.log(`   Recipient: ${allocation.recipient}`);
    console.log(`   Status: ${allocation.status}`);
    console.log(`   Last claim: ${allocation.lastClaim || 'Never'}`);
    console.log('');
  });

  console.log(`Total allocated: ${vesting.metadata.totalAllocated?.toLocaleString() || 'Unknown'} CLWDN`);
  console.log(`Network: ${vesting.metadata.network}`);
  console.log(`Created: ${vesting.metadata.createdAt}`);
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
    initializeClwdnVesting();
  } else if (args.claim) {
    const allocationId = args.claim === true ? args.id : args.claim;
    const wallet = args.wallet || authority.publicKey.toBase58();

    if (!allocationId) {
      console.error('❌ Must specify --claim <allocation_id> or --claim --id <allocation_id>');
      process.exit(1);
    }

    const result = await claimVesting(allocationId, wallet);
    console.log('\n✅ Claim successful!');
    console.log(JSON.stringify(result, null, 2));
  } else if (args.status || args.view) {
    const allocationId = args.status === true ? args.id : args.status;
    viewVesting(allocationId || null);
  } else {
    console.log(`
CLWDN Vesting Factory — Factory-Style Token Distribution

Usage:
  Initialize:  node clwdn-vesting-factory.js --init
  View status: node clwdn-vesting-factory.js --status [--id <allocation_id>]
  Claim:       node clwdn-vesting-factory.js --claim <allocation_id> [--wallet <address>]

Allocations:
  team        - 150M CLWDN (2-year linear vesting)
  staking     - 150M CLWDN (4-year linear vesting)
  community   - 100M CLWDN (manual distribution)
  treasury    - 100M CLWDN (governance controlled)
  development - 50M CLWDN (as needed)

Examples:
  node clwdn-vesting-factory.js --init
  node clwdn-vesting-factory.js --status
  node clwdn-vesting-factory.js --claim team --wallet 6PdEt7HJFNpY6X7GL7yPJxkqx2PRBsuUWdUScaXsT7H
    `);
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  });
}

module.exports = { initializeClwdnVesting, claimVesting, viewVesting, loadVesting, TOKENOMICS };
