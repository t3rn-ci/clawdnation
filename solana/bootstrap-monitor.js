/**
 * Bootstrap Monitor — tracks SOL contributions and records CLWDN allocations
 * 
 * Watches the payment address for incoming SOL transfers.
 * Records each contribution with sender address and CLWDN allocation.
 * When bootstrap is complete or CLWDN token is minted, distribute tokens.
 * 
 * Data stored in bootstrap.json
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const BOOTSTRAP_PATH = path.join(__dirname, 'bootstrap.json');
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
const POLL_INTERVAL = parseInt(process.env.BOOTSTRAP_POLL_INTERVAL || '15000');

// Bootstrap config
const PRICE_PER_TOKEN = 0.0001; // SOL per CLWDN
const BOOTSTRAP_ALLOCATION = 100_000_000; // 100M CLWDN for bootstrap
const TARGET_SOL = 10_000; // 10K SOL target

const connection = new Connection(RPC, 'confirmed');

function loadBootstrap() {
  if (!fs.existsSync(BOOTSTRAP_PATH)) {
    return {
      status: 'active',
      contributions: [],
      totalSol: 0,
      totalClwdn: 0,
      seenTxs: {},
    };
  }
  try { return JSON.parse(fs.readFileSync(BOOTSTRAP_PATH, 'utf8')); } catch { 
    return { status: 'active', contributions: [], totalSol: 0, totalClwdn: 0, seenTxs: {} };
  }
}

function saveBootstrap(data) {
  fs.writeFileSync(BOOTSTRAP_PATH, JSON.stringify(data, null, 2));
}

/**
 * Check for new contributions
 */
async function checkContributions() {
  const data = loadBootstrap();
  if (data.status !== 'active') {
    return; // bootstrap ended
  }

  const address = new PublicKey(PAYMENT_ADDRESS);

  try {
    const sigs = await connection.getSignaturesForAddress(address, { limit: 30 });
    let changed = false;

    for (const sig of sigs) {
      if (data.seenTxs[sig.signature]) continue;

      const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.meta) {
        data.seenTxs[sig.signature] = { skipped: 'no-meta', at: new Date().toISOString() };
        changed = true;
        continue;
      }

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
          const dest = ix.parsed.info.destination;
          const lamports = ix.parsed.info.lamports;
          const sol = lamports / LAMPORTS_PER_SOL;
          const sender = ix.parsed.info.source;

          // Skip self-transfers
          if (sender === PAYMENT_ADDRESS) {
            data.seenTxs[sig.signature] = { skipped: 'self-transfer', at: new Date().toISOString() };
            changed = true;
            continue;
          }

          if (dest === PAYMENT_ADDRESS && sol > 0) {
            const clwdnAmount = Math.floor(sol / PRICE_PER_TOKEN);
            
            // Check if bootstrap cap would be exceeded
            if (data.totalClwdn + clwdnAmount > BOOTSTRAP_ALLOCATION) {
              console.log(`⚠️  Contribution would exceed bootstrap cap. Remaining: ${(BOOTSTRAP_ALLOCATION - data.totalClwdn).toLocaleString()} CLWDN`);
            }

            const contribution = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              sender,
              sol,
              clwdn: clwdnAmount,
              tx: sig.signature,
              blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
              recordedAt: new Date().toISOString(),
              distributed: false, // will be true when CLWDN tokens are actually sent
            };

            data.contributions.push(contribution);
            data.totalSol += sol;
            data.totalClwdn += clwdnAmount;
            data.seenTxs[sig.signature] = { contributionId: contribution.id, at: new Date().toISOString() };
            changed = true;

            console.log(`💰 Bootstrap contribution: ${sol} SOL from ${sender.slice(0,6)}…${sender.slice(-4)} → ${clwdnAmount.toLocaleString()} CLWDN (tx: ${sig.signature.slice(0,8)}…)`);

            // Check if bootstrap target reached
            if (data.totalSol >= TARGET_SOL) {
              data.status = 'completed';
              console.log(`🎉 BOOTSTRAP COMPLETE! Total: ${data.totalSol} SOL, ${data.totalClwdn.toLocaleString()} CLWDN allocated`);
            }
          }
        }
      }

      if (!data.seenTxs[sig.signature]) {
        data.seenTxs[sig.signature] = { skipped: 'no-transfer', at: new Date().toISOString() };
        changed = true;
      }
    }

    if (changed) {
      saveBootstrap(data);
    }
  } catch (e) {
    console.error('Bootstrap check error:', e.message);
  }
}

/**
 * Get bootstrap stats
 */
function getStats() {
  const data = loadBootstrap();
  const contributorMap = {};
  for (const c of data.contributions) {
    if (!contributorMap[c.sender]) contributorMap[c.sender] = { sol: 0, clwdn: 0, count: 0 };
    contributorMap[c.sender].sol += c.sol;
    contributorMap[c.sender].clwdn += c.clwdn;
    contributorMap[c.sender].count += 1;
  }

  return {
    status: data.status,
    totalSol: data.totalSol,
    totalClwdn: data.totalClwdn,
    targetSol: TARGET_SOL,
    allocationTotal: BOOTSTRAP_ALLOCATION,
    remaining: BOOTSTRAP_ALLOCATION - data.totalClwdn,
    contributors: Object.keys(contributorMap).length,
    contributions: data.contributions.length,
    topContributors: Object.entries(contributorMap)
      .sort((a, b) => b[1].sol - a[1].sol)
      .slice(0, 10)
      .map(([addr, d]) => ({ address: addr, sol: d.sol, clwdn: d.clwdn, contributions: d.count })),
    progressPct: (data.totalSol / TARGET_SOL * 100).toFixed(2),
  };
}

/**
 * Get allocation for a specific wallet
 */
function getAllocation(walletAddress) {
  const data = loadBootstrap();
  const contributions = data.contributions.filter(c => c.sender === walletAddress);
  if (!contributions.length) return null;

  return {
    wallet: walletAddress,
    totalSol: contributions.reduce((s, c) => s + c.sol, 0),
    totalClwdn: contributions.reduce((s, c) => s + c.clwdn, 0),
    contributions: contributions.length,
    distributed: contributions.every(c => c.distributed),
    history: contributions.map(c => ({
      sol: c.sol,
      clwdn: c.clwdn,
      tx: c.tx,
      at: c.blockTime || c.recordedAt,
    })),
  };
}

/**
 * Start monitoring
 */
function startMonitor() {
  console.log('🔴 Bootstrap monitor started');
  console.log(`   Payment address: ${PAYMENT_ADDRESS}`);
  console.log(`   Rate: ${PRICE_PER_TOKEN} SOL per CLWDN`);
  console.log(`   Target: ${TARGET_SOL.toLocaleString()} SOL`);
  console.log(`   Allocation: ${BOOTSTRAP_ALLOCATION.toLocaleString()} CLWDN`);
  console.log(`   Poll interval: ${POLL_INTERVAL}ms`);

  // Initial check
  checkContributions();
  setInterval(checkContributions, POLL_INTERVAL);
}

if (require.main === module) {
  startMonitor();
}

module.exports = { checkContributions, getStats, getAllocation, loadBootstrap };
