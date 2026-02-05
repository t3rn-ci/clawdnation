/**
 * Bootstrap Monitor v2 — reads state directly from on-chain bootstrap program
 * 
 * Instead of watching individual transfers (rate-limited, fragile),
 * reads BootstrapState and ContributorRecord accounts from the program.
 * Single RPC call every poll interval.
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const NETWORK = process.env.NETWORK || 'devnet';
const RPC = process.env.SOLANA_RPC || (NETWORK === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
const BOOTSTRAP_PATH = path.join(__dirname, 'bootstrap.json');
const POLL_INTERVAL = parseInt(process.env.BOOTSTRAP_POLL_INTERVAL || (NETWORK === 'mainnet' ? '60000' : '15000'));

// Bootstrap program IDs
const BOOTSTRAP_PROGRAM = new PublicKey(
  NETWORK === 'mainnet'
    ? '91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No'
    : 'CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC'
);

const connection = new Connection(RPC, 'confirmed');

// Anchor discriminators (first 8 bytes of sha256("account:AccountName"))
const BOOTSTRAP_STATE_DISC = '64ae7350782f6f7a';
const CONTRIBUTOR_RECORD_DISC = 'cd5086e45587c5b0';

/**
 * Parse BootstrapState from raw account data (260 bytes)
 * Layout: 8 disc + 32 authority + 1+32 pending_authority(Option) + 32 lp + 32 master + 32 staking
 *         + u64 start_rate + u64 end_rate + u64 allocation_cap
 *         + u64 min_contribution + u64 max_per_wallet
 *         + bool paused + bool bootstrap_complete
 *         + u64 total_contributed_lamports + u64 total_allocated_clwdn
 *         + u64 contributor_count + u64 lp_received + u64 master_received + u64 staking_received
 *         + u8 bump
 */
function parseBootstrapState(data) {
  if (data.length < 200) return null;
  const buf = Buffer.from(data);
  
  let off = 8; // skip discriminator
  const authority = new PublicKey(buf.slice(off, off + 32)); off += 32;
  
  // Option<Pubkey> pending_authority: 1 byte tag + 32 bytes if Some
  const hasPending = buf.readUInt8(off); off += 1;
  let pendingAuthority = null;
  if (hasPending) { pendingAuthority = new PublicKey(buf.slice(off, off + 32)); off += 32; }
  // Borsh Option: only advance 32 if Some (already advanced above)
  
  const lpWallet = new PublicKey(buf.slice(off, off + 32)); off += 32;
  const masterWallet = new PublicKey(buf.slice(off, off + 32)); off += 32;
  const stakingWallet = new PublicKey(buf.slice(off, off + 32)); off += 32;
  
  const startRate = buf.readBigUInt64LE(off); off += 8;
  const endRate = buf.readBigUInt64LE(off); off += 8;
  const allocationCap = buf.readBigUInt64LE(off); off += 8;
  const minContribution = buf.readBigUInt64LE(off); off += 8;
  const maxPerWallet = buf.readBigUInt64LE(off); off += 8;
  
  const paused = buf.readUInt8(off) !== 0; off += 1;
  const bootstrapComplete = buf.readUInt8(off) !== 0; off += 1;
  
  const totalContributedLamports = buf.readBigUInt64LE(off); off += 8;
  const totalAllocatedClwdn = buf.readBigUInt64LE(off); off += 8;
  const contributorCount = buf.readBigUInt64LE(off); off += 8;
  const lpReceivedLamports = buf.readBigUInt64LE(off); off += 8;
  const masterReceivedLamports = buf.readBigUInt64LE(off); off += 8;
  const stakingReceivedLamports = buf.readBigUInt64LE(off); off += 8;
  
  return {
    authority: authority.toBase58(),
    pendingAuthority: pendingAuthority ? pendingAuthority.toBase58() : null,
    lpWallet: lpWallet.toBase58(),
    masterWallet: masterWallet.toBase58(),
    stakingWallet: stakingWallet.toBase58(),
    startRate: Number(startRate),
    endRate: Number(endRate),
    allocationCap: Number(allocationCap),
    minContribution: Number(minContribution),
    maxPerWallet: Number(maxPerWallet),
    paused,
    bootstrapComplete,
    totalContributedLamports: Number(totalContributedLamports),
    totalAllocatedClwdn: Number(totalAllocatedClwdn),
    contributorCount: Number(contributorCount),
    lpReceivedLamports: Number(lpReceivedLamports),
    masterReceivedLamports: Number(masterReceivedLamports),
    stakingReceivedLamports: Number(stakingReceivedLamports),
  };
}

/**
 * Parse ContributorRecord from raw account data (73 bytes)
 * Layout: 8 disc + 32 contributor + u64 total_contributed_lamports + u64 total_allocated_clwdn
 *         + u64 contribution_count + i64 last_contribution_at + bool distributed
 */
function parseContributorRecord(data) {
  if (data.length < 65) return null;
  const buf = Buffer.from(data);
  
  let off = 8;
  const contributor = new PublicKey(buf.slice(off, off + 32)); off += 32;
  const totalContributedLamports = buf.readBigUInt64LE(off); off += 8;
  const totalAllocatedClwdn = buf.readBigUInt64LE(off); off += 8;
  const contributionCount = buf.readBigUInt64LE(off); off += 8;
  const lastContributionAt = Number(buf.readBigInt64LE(off)); off += 8;
  const distributed = off < buf.length ? buf.readUInt8(off) !== 0 : false;
  
  return {
    contributor: contributor.toBase58(),
    totalContributedLamports: Number(totalContributedLamports),
    totalAllocatedClwdn: Number(totalAllocatedClwdn),
    contributionCount: Number(contributionCount),
    lastContributionAt: lastContributionAt ? new Date(lastContributionAt * 1000).toISOString() : null,
    distributed,
  };
}

/**
 * Fetch all program accounts and parse state + contributors
 */
async function fetchBootstrapState() {
  try {
    const accounts = await connection.getProgramAccounts(BOOTSTRAP_PROGRAM);
    
    let state = null;
    const contributors = [];
    
    for (const { pubkey, account } of accounts) {
      const data = account.data;
      const disc = data.slice(0, 8).toString('hex');
      
      if (disc === BOOTSTRAP_STATE_DISC) {
        state = parseBootstrapState(data);
        if (state) state.pubkey = pubkey.toBase58();
      } else if (disc === CONTRIBUTOR_RECORD_DISC) {
        const record = parseContributorRecord(data);
        if (record) {
          record.pubkey = pubkey.toBase58();
          contributors.push(record);
        }
      }
    }
    
    return { state, contributors };
  } catch (e) {
    console.error('Bootstrap fetch error:', e.message);
    return { state: null, contributors: [] };
  }
}

// Cache for the API
let cachedData = null;

async function checkContributions() {
  const { state, contributors } = await fetchBootstrapState();
  
  if (!state) {
    console.error('Bootstrap: No state account found');
    return;
  }
  
  const totalSol = state.totalContributedLamports / 1e9;
  const targetSol = state.allocationCap * 0.0001; // rough estimate based on start rate
  
  cachedData = {
    status: state.bootstrapComplete ? 'completed' : (state.paused ? 'paused' : 'active'),
    onChain: state,
    contributions: contributors.map(c => ({
      sender: c.contributor,
      sol: c.totalContributedLamports / 1e9,
      clwdn: c.totalAllocatedClwdn / 1e9,  // Convert from raw token amount to human-readable
      count: c.contributionCount,
      lastAt: c.lastContributionAt,
      distributed: c.distributed,
    })),
    totalSol,
    totalClwdn: state.totalAllocatedClwdn / 1e9,  // Convert from raw token amount to human-readable
    contributorCount: state.contributorCount,
    lastChecked: new Date().toISOString(),
  };

  // Save to disk
  fs.writeFileSync(BOOTSTRAP_PATH, JSON.stringify(cachedData, null, 2));

  if (contributors.length > 0) {
    console.log(`💰 Bootstrap: ${totalSol.toFixed(4)} SOL contributed, ${(state.totalAllocatedClwdn / 1e9).toLocaleString()} CLWDN allocated, ${state.contributorCount} contributors`);
  }
}

function getStats() {
  if (cachedData) {
    const d = cachedData;
    const onChain = d.onChain || {};
    return {
      status: d.status,
      totalSol: d.totalSol || 0,
      totalClwdn: d.totalClwdn || 0,
      targetSol: 10000,
      allocationTotal: onChain.allocationCap || 100000000,
      remaining: (onChain.allocationCap || 100000000) - (d.totalClwdn || 0),
      contributors: d.contributorCount || 0,
      contributions: (d.contributions || []).reduce((s, c) => s + (c.count || 0), 0),
      topContributors: (d.contributions || [])
        .sort((a, b) => b.sol - a.sol)
        .slice(0, 10)
        .map(c => ({ address: c.sender, sol: c.sol, clwdn: c.clwdn, contributions: c.count })),
      progressPct: ((d.totalSol || 0) / 10000 * 100).toFixed(2),
      onChain: {
        startRate: onChain.startRate,
        endRate: onChain.endRate,
        minContribution: onChain.minContribution,
        maxPerWallet: onChain.maxPerWallet,
        paused: onChain.paused,
        bootstrapComplete: onChain.bootstrapComplete,
        lpReceived: onChain.lpReceivedLamports ? onChain.lpReceivedLamports / 1e9 : 0,
        masterReceived: onChain.masterReceivedLamports ? onChain.masterReceivedLamports / 1e9 : 0,
        stakingReceived: onChain.stakingReceivedLamports ? onChain.stakingReceivedLamports / 1e9 : 0,
      },
    };
  }
  
  // Try loading from file
  try {
    const data = JSON.parse(fs.readFileSync(BOOTSTRAP_PATH, 'utf8'));
    cachedData = data;
    return getStats();
  } catch {
    return {
      status: 'active',
      totalSol: 0,
      totalClwdn: 0,
      targetSol: 10000,
      allocationTotal: 100000000,
      remaining: 100000000,
      contributors: 0,
      contributions: 0,
      topContributors: [],
      progressPct: '0.00',
    };
  }
}

function getAllocation(walletAddress) {
  if (!cachedData) return null;
  const c = (cachedData.contributions || []).find(x => x.sender === walletAddress);
  if (!c) return null;
  return {
    wallet: walletAddress,
    totalSol: c.sol,
    totalClwdn: c.clwdn,
    contributions: c.count,
    distributed: c.distributed,
    lastAt: c.lastAt,
  };
}

function loadBootstrap() {
  try {
    return JSON.parse(fs.readFileSync(BOOTSTRAP_PATH, 'utf8'));
  } catch {
    return { status: 'active', contributions: [], totalSol: 0, totalClwdn: 0 };
  }
}

if (require.main === module) {
  console.log('🔴 Bootstrap monitor v2 started (on-chain state reader)');
  console.log(`   Program: ${BOOTSTRAP_PROGRAM.toBase58()}`);
  console.log(`   RPC: ${RPC}`);
  console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
  checkContributions();
  setInterval(checkContributions, POLL_INTERVAL);
}

module.exports = { checkContributions, getStats, getAllocation, loadBootstrap };
