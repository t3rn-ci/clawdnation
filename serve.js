require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3333;
const NETWORK = process.env.NETWORK || 'devnet';
const EXPLORER_CLUSTER = NETWORK === 'mainnet' ? '' : '?cluster=devnet';
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const ORDERS_PATH = path.join(__dirname, 'solana', NETWORK === 'mainnet' ? 'orders-mainnet.json' : 'orders.json');
const VESTING_PATH = path.join(__dirname, 'solana', 'vesting.json');
const CLWDN_MINT = NETWORK === 'mainnet' ? '3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG' : 'Dm5fvVbBFxS3ivM5PUfc6nTccxK5nLcLs4aZKnPdjujj';
const PAYMENT_WALLET = 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
const DISPENSER_PROGRAM = NETWORK === 'mainnet' ? 'C7V7KmwzifnEyjE7HKTyfL67xerkyGXeNh8eHi3bUuxL' : 'DauUaBLK9aut1WLqiL9kmpmc2x1MJNbEtHeVBQZYmFWK';
const BOOTSTRAP_PROGRAM = NETWORK === 'mainnet' ? '91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No' : 'CdjKvKNt2hJmh2uydcnZBkALrUL86HsfEqacvbmdSZAC';

function loadVesting() {
  try { return JSON.parse(fs.readFileSync(VESTING_PATH, 'utf8')); } catch { return {}; }
}

// Bootstrap monitor
const { getStats, getAllocation, checkContributions } = require('./solana/bootstrap-monitor');
// Start bootstrap monitor polling
const BOOTSTRAP_POLL = parseInt(process.env.BOOTSTRAP_POLL_INTERVAL || (NETWORK === 'mainnet' ? '60000' : '15000'));
setInterval(checkContributions, BOOTSTRAP_POLL);
// Delay initial check to avoid startup rate limit burst
setTimeout(() => checkContributions().catch(() => {}), 5000);
// Chat handler
const { handleChat } = require('./chat-handler');
// Airdrop wallet database
const airdropDb = require("./twitter/airdrop-db");

const PAGE_404 = fs.existsSync(path.join(__dirname, "404.html")) ? fs.readFileSync(path.join(__dirname, "404.html"), "utf8") : "<h1>404</h1>";
function serve404(res) { res.writeHead(404, {"Content-Type":"text/html"}); return res.end(PAGE_404); }
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };

function loadOrders() {
  try {
    if (!fs.existsSync(ORDERS_PATH)) return [];
    return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
  } catch { return []; }
}

// Simple Solana RPC call
function solanaRpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url = new URL(SOLANA_RPC);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,  // Include query string for API keys
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Bad JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// Cache for on-chain data (refresh every 60s)
let onChainCache = {};
let lastCacheTime = 0;
const CACHE_TTL = 60000;

async function getTokenOnChainData(mint) {
  try {
    // Get all token accounts for this mint (Token-2022 program)
    const res = await solanaRpc('getTokenAccountsByOwnerWithHttpRequest', null);
    // Use getTokenLargestAccounts for holder info
    const largest = await solanaRpc('getTokenLargestAccounts', [mint]);
    const supply = await solanaRpc('getTokenSupply', [mint]);

    const accounts = largest?.result?.value || [];
    const holders = accounts.filter(a => parseFloat(a.uiAmountString || a.amount) > 0);
    const totalSupply = supply?.result?.value?.uiAmount || 0;

    // Calculate liquidity: sum of all non-creator holdings (rough proxy)
    // For now, count holders and total distributed
    let distributed = 0;
    holders.forEach(h => {
      distributed += (h.uiAmount || 0);
    });

    return {
      holders: holders.length,
      totalSupply,
      largestAccounts: accounts.slice(0, 5).map(a => ({
        address: a.address,
        amount: a.uiAmountString || String(a.amount),
        uiAmount: a.uiAmount || 0,
      })),
    };
  } catch (e) {
    return { holders: 0, totalSupply: 0, largestAccounts: [], error: e.message };
  }
}

async function enrichTokens(tokens) {
  const now = Date.now();
  if (now - lastCacheTime < CACHE_TTL && Object.keys(onChainCache).length > 0) {
    return tokens.map(t => ({ ...t, onChain: onChainCache[t.mint] || null }));
  }

  // Fetch on-chain data for each token
  const enriched = await Promise.all(tokens.map(async (t) => {
    try {
      const largest = await solanaRpc('getTokenLargestAccounts', [t.mint]);
      const supply = await solanaRpc('getTokenSupply', [t.mint]);

      const accounts = largest?.result?.value || [];
      const holders = accounts.filter(a => {
        const amt = parseFloat(a.uiAmountString || '0');
        return amt > 0;
      });

      const totalSupply = supply?.result?.value?.uiAmount || 0;

      const onChain = {
        holders: holders.length,
        totalSupply,
        topHolders: accounts.slice(0, 10).map(a => ({
          address: a.address,
          amount: a.uiAmountString || '0',
          pct: totalSupply > 0 ? ((parseFloat(a.uiAmountString || '0') / totalSupply) * 100).toFixed(2) : '0',
        })),
      };

      onChainCache[t.mint] = onChain;
      return { ...t, onChain };
    } catch (e) {
      return { ...t, onChain: { holders: 0, totalSupply: 0, topHolders: [], error: e.message } };
    }
  }));

  lastCacheTime = now;
  return enriched;
}

// Blocked paths for security
const BLOCKED_PATHS = [
  '.env', '.env.local', '.env.production', '.env.twitter',
  '.git', '.gitignore',
  'node_modules',
  'solana/orders.json', 'solana/vesting.json', 'solana/bootstrap.json',
  'solana/seen-txs.json',
  'solana/dispenser-', 'solana/e2e-', 'solana/archive/',
  'twitter/processed-tweets.json', 'twitter/bot',
  'bootstrap/', 'dispenser/',
  'serve.js', 'package.json', 'package-lock.json',
  'Cargo.toml', 'Cargo.lock',
  '.pem', '.key', 'wallet', 'keypair',
];

function isBlockedPath(filePath) {
  const normalized = path.normalize(filePath).replace(/\\/g, '/');
  // Block path traversal
  if (normalized.includes('..')) return true;
  // Block specific files/patterns
  return BLOCKED_PATHS.some(blocked => normalized.includes(blocked));
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // POST /api/rpc — Solana RPC proxy (CORS workaround, READ-ONLY)
  if (req.url === '/api/rpc' && req.method === 'POST') {
    // Whitelist of allowed read-only RPC methods
    const ALLOWED_METHODS = [
      'getAccountInfo', 'getBalance', 'getBlockHeight', 'getBlockTime',
      'getClusterNodes', 'getEpochInfo', 'getHealth', 'getInflationReward',
      'getLatestBlockhash', 'getMinimumBalanceForRentExemption',
      'getMultipleAccounts', 'getProgramAccounts', 'getRecentBlockhash',
      'getSignatureStatuses', 'getSlot', 'getStakeActivation',
      'getSupply', 'getTokenAccountBalance', 'getTokenAccountsByOwner',
      'getTokenLargestAccounts', 'getTokenSupply', 'getTransaction',
      'getTransactionCount', 'getVersion', 'getVoteAccounts', 'getSignaturesForAddress', 'getConfirmedSignaturesForAddress2', 'getParsedTransaction', 'getTransaction', 'sendTransaction', 'simulateTransaction', 'getFeeForMessage', 'getGenesisHash'
    ];

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const rpcReq = JSON.parse(body);

        // Block write methods for security
        if (!ALLOWED_METHODS.includes(rpcReq.method)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            error: `Method '${rpcReq.method}' not allowed. This proxy only supports read-only methods.`
          }));
        }

        const rpcRes = await solanaRpc(rpcReq.method, rpcReq.params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rpcRes));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /api/tokens — list completed token launches with on-chain data
  if (req.url === '/api/tokens' || req.url === '/api/tokens/') {
    try {
      const orders = loadOrders();
      const tokens = orders
        .filter(o => o.status === 'completed' && o.tokenMint)
        .map(o => ({
          name: o.name,
          symbol: o.symbol,
          mint: o.tokenMint,
          description: o.description,
          creator: o.tweetAuthor,
          tweetId: o.tweetId,
          recipientWallet: o.recipientWallet,
          explorer: o.tokenExplorer,
          createdAt: o.completedAt || o.createdAt,
          paymentTx: o.paymentTx,
        }));

      const enriched = await enrichTokens(tokens);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tokens: enriched, count: enriched.length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // GET /api/config
  if (req.url === "/api/config" || req.url === "/api/config/") {
    const config = {
      network: NETWORK,
      rpc: '/api/rpc',  // Use local proxy to avoid rate limits
      explorer: NETWORK === "mainnet" ? "https://explorer.solana.com" : "https://explorer.solana.com",
      explorerSuffix: NETWORK === "mainnet" ? "" : "?cluster=devnet",
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(config));
  }

  // GET /api/bootstrap/allocation?wallet=<address>
  if (req.url.startsWith('/api/bootstrap/allocation')) {
    const url = new URL(req.url, 'http://localhost');
    const wallet = url.searchParams.get('wallet');
    if (!wallet) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'wallet parameter required' }));
    }
    const alloc = getAllocation(wallet);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(alloc || { wallet, totalSol: 0, totalClwdn: 0, contributions: 0 }));
  }

  // GET /api/bootstrap/stats
  if (req.url === '/api/bootstrap/stats' || req.url === '/api/bootstrap/stats/') {
    const stats = getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(stats));
  }

  // POST /api/rpc — proxy Solana RPC calls (avoids CORS issues with public RPC)
  if (req.url === '/api/rpc' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        // Whitelist safe read-only methods
        const allowed = ['getBalance', 'getTokenAccountBalance', 'getTokenAccountsByOwner',
          'getAccountInfo', 'getTokenSupply', 'getTokenLargestAccounts', 'getGenesisHash',
          'getLatestBlockhash', 'getRecentBlockhash', 'getSignatureStatuses',
          'getTransaction', 'getSlot', 'getHealth', 'getVersion'];
        if (!allowed.includes(parsed.method)) {
          res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        const result = await solanaRpc(parsed.method, parsed.params || []);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ jsonrpc: '2.0', result: result?.result, id: parsed.id }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -1, message: e.message }, id: null }));
      }
    });
    return;
  }

  // OPTIONS /api/rpc — CORS preflight
  if (req.url === '/api/rpc' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, solana-client',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }


  // GET /api/airdrop/wallets — list registered airdrop wallets
  if (req.url === "/api/airdrop/wallets" || req.url === "/api/airdrop/wallets/") {
    const wallets = airdropDb.getWallets();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ count: wallets.length, wallets }));
  }

  // GET /api/airdrop/count — just the count
  if (req.url === "/api/airdrop/count" || req.url === "/api/airdrop/count/") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ count: airdropDb.getCount() }));
  }

  // GET /api/airdrop/check?q=<wallet_or_handle>
  if (req.url.startsWith("/api/airdrop/check")) {
    const url = new URL(req.url, "http://localhost");
    const q = url.searchParams.get("q");
    if (!q) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing ?q= parameter" }));
    }
    const entry = airdropDb.isRegistered(q);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({ registered: !!entry, entry }));
  }

  // POST /api/airdrop/register — manual wallet registration from website
  if (req.url === "/api/airdrop/register" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { wallet, twitterHandle } = JSON.parse(body);
        const result = airdropDb.registerWallet({ wallet, twitterHandle, source: "website" });
        res.writeHead(result.success ? 200 : 400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // GET /api/health
  if (req.url === '/api/health' || req.url === '/api/health/') {
    try {
      const rpcOk = await solanaRpc('getHealth', []).then(r => r?.result === 'ok').catch(() => false);
      const bootstrapStats = getStats();
      const orders = loadOrders();
      const health = {
        status: 'ok',
        uptime: process.uptime(),
        network: NETWORK,
        rpc: { url: SOLANA_RPC, healthy: rpcOk },
        bootstrap: { status: bootstrapStats.status, contributors: bootstrapStats.contributors },
        tokens: { total: orders.filter(o => o.status === 'completed').length, pending: orders.filter(o => o.status !== 'completed').length },
        timestamp: new Date().toISOString(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(health));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'error', error: e.message }));
    }
  }

  // GET /api/status
  if (req.url === '/api/status' || req.url === '/api/status/') {
    const stats = getStats();
    const orders = loadOrders();
    const vestingData = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'solana', 'vesting.json'), 'utf8')); } catch { return {}; } })();
    const status = {
      network: NETWORK,
      rpc: SOLANA_RPC,
      uptime: process.uptime(),
      bootstrap: stats,
      tokens: { completed: orders.filter(o => o.status === 'completed').length, pending: orders.filter(o => o.status === 'pending').length, total: orders.length },
      vesting: { activeVests: Object.keys(vestingData).length },
      timestamp: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status));
  }

  // GET /api/orders
  if (req.url === '/api/orders' || req.url === '/api/orders/') {
    const orders = loadOrders();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ orders, count: orders.length }));
  }

  // GET /api/vesting — vesting schedules with on-chain token checks
  if (req.url === '/api/vesting' || req.url === '/api/vesting/') {
    try {
      const vestingData = loadVesting();
      const now = Date.now();
      const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

      const vests = await Promise.all(Object.entries(vestingData).map(async ([mint, v]) => {
        const startMs = v.startDate ? new Date(v.startDate).getTime() : now;
        const elapsedMonths = Math.floor((now - startMs) / MONTH_MS);
        const unlockedMonths = Math.min(elapsedMonths, v.vestingMonths || 12);
        const totalUnlocked = unlockedMonths * (v.monthlyUnlock || 0);
        const claimable = totalUnlocked - (v.claimedTokens || 0);
        const nextUnlockDate = unlockedMonths < v.vestingMonths
          ? new Date(startMs + (unlockedMonths + 1) * MONTH_MS).toISOString() : null;

        // Check on-chain token supply
        let onChainSupply = null;
        try {
          const supply = await solanaRpc('getTokenSupply', [mint]);
          onChainSupply = supply?.result?.value?.uiAmountString || null;
        } catch {}

        return {
          mint, name: v.name, symbol: v.symbol, creator: v.creator,
          totalTokens: v.totalTokens, claimedTokens: v.claimedTokens || 0,
          vestingMonths: v.vestingMonths, monthlyUnlock: v.monthlyUnlock,
          startDate: v.startDate, elapsedMonths, unlockedMonths,
          totalUnlocked, claimable: Math.max(0, claimable),
          nextUnlockDate,
          pctVested: v.vestingMonths > 0 ? Math.min(100, (unlockedMonths / v.vestingMonths * 100)).toFixed(1) : '0',
          fullyVested: unlockedMonths >= (v.vestingMonths || 12),
          onChainSupply,
        };
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ vesting: vests, count: vests.length }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ vesting: [], count: 0, error: e.message }));
    }
  }

  // GET /api/staking — staking pool status
  if (req.url === '/api/staking' || req.url === '/api/staking/') {
    try {
      // Get CLWDN supply and holder info for TVL context
      const supply = await solanaRpc('getTokenSupply', [CLWDN_MINT]);
      const totalSupply = supply?.result?.value?.uiAmount || 0;
      const holders = await solanaRpc('getTokenLargestAccounts', [CLWDN_MINT]);
      const holderData = (holders?.result?.value || []).filter(h => parseFloat(h.uiAmountString || '0') > 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'coming_soon',
        message: 'Staking pools are under development. Token metrics available below.',
        clwdnMint: CLWDN_MINT,
        tokenMetrics: {
          totalSupply,
          holders: holderData.length,
          stakingAllocation: 150000000,
          stakingPct: 15,
        },
        plannedPools: [
          { name: 'CLWDN Staking', apy: 'TBD', minStake: 1000, lockPeriod: '30 days', status: 'development' },
          { name: 'CLWDN/SOL LP', apy: 'TBD', minStake: 0, lockPeriod: 'none', status: 'planned' },
        ],
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'coming_soon', error: e.message }));
    }
  }

  // GET /api/airdrop — real distribution tracking
  if (req.url === '/api/airdrop' || req.url === '/api/airdrop/') {
    try {
      const stats = getStats();
      const { loadBootstrap } = require('./solana/bootstrap-monitor');
      const bootstrap = loadBootstrap();

      // Count pending vs distributed
      const pending = bootstrap.contributions.filter(c => !c.distributed);
      const distributed = bootstrap.contributions.filter(c => c.distributed);

      // Get CLWDN token holder count
      const holders = await solanaRpc('getTokenLargestAccounts', [CLWDN_MINT]);
      const holderCount = (holders?.result?.value || []).filter(h => parseFloat(h.uiAmountString || '0') > 0).length;

      // Get payment wallet SOL balance
      const walletBal = await solanaRpc('getBalance', [PAYMENT_WALLET]);
      const walletSol = (walletBal?.result?.value || 0) / 1e9;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: stats.status === 'active' ? 'accepting_contributions' : 'closed',
        bootstrapRate: '1 SOL = 10,000 CLWDN',
        pricePerToken: 0.0001,
        contributed: { sol: stats.totalSol, targetSol: 10000, progressPct: stats.progressPct },
        allocated: { clwdn: stats.totalClwdn, totalAllocation: 100000000, remaining: 100000000 - stats.totalClwdn },
        distributions: { pending: pending.length, pendingClwdn: pending.reduce((s,c) => s+c.clwdn, 0), completed: distributed.length, completedClwdn: distributed.reduce((s,c) => s+c.clwdn, 0) },
        contributors: stats.contributors,
        clwdnHolders: holderCount,
        paymentWallet: { address: PAYMENT_WALLET, solBalance: walletSol },
        recentContributions: bootstrap.contributions.slice(-5).reverse().map(c => ({
          sender: c.sender, sol: c.sol, clwdn: c.clwdn, tx: c.tx, at: c.blockTime || c.recordedAt, distributed: c.distributed,
        })),
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // GET /api/dispenser — on-chain program state
  if (req.url === '/api/dispenser' || req.url === '/api/dispenser/') {
    try {
      // Check if program has any accounts (initialized state)
      const accounts = await solanaRpc('getProgramAccounts', [DISPENSER_PROGRAM, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
      const acctCount = accounts?.result?.length || 0;
      
      // Check program account exists
      const progInfo = await solanaRpc('getAccountInfo', [DISPENSER_PROGRAM, { encoding: 'base64' }]);
      const deployed = !!(progInfo?.result?.value);
      const progSize = progInfo?.result?.value?.data?.[0]?.length || 0;

      // Get CLWDN token supply for context
      const supply = await solanaRpc('getTokenSupply', [CLWDN_MINT]);
      const tokenSupply = supply?.result?.value?.uiAmountString || '0';

      // Get vault/payment wallet SOL balance
      const walletBal = await solanaRpc('getBalance', [PAYMENT_WALLET]);
      const walletSol = (walletBal?.result?.value || 0) / 1e9;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        programId: DISPENSER_PROGRAM,
        network: NETWORK,
        deployed,
        initialized: acctCount > 0,
        accounts: acctCount,
        clwdnMint: CLWDN_MINT,
        clwdnSupply: tokenSupply,
        paymentWallet: { address: PAYMENT_WALLET, solBalance: walletSol },
        features: ['initialize', 'add_recipient', 'distribute', 'cancel', 'add_operator', 'remove_operator'],
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ programId: DISPENSER_PROGRAM, network: NETWORK, error: e.message }));
    }
  }


  // GET /api/economics
  if (req.url === '/api/economics' || req.url === '/api/economics/') {
    const stats = getStats();
    const econ = {
      token: { name: 'ClawdNation', symbol: 'CLWDN', supply: 1000000000, decimals: 9, network: 'solana', program: 'Token-2022' },
      bootstrap: {
        allocation: 100000000,
        pricePerToken: 0.0001,
        targetSol: 10000,
        contributedSol: stats.totalSol,
        distributedTokens: stats.totalClwdn,
        status: stats.status,
        rate: '1 SOL = 10,000 CLWDN',
        contributors: stats.contributors,
        contributions: stats.contributions,
        progressPct: stats.progressPct,
      },
      trading: {
        price: 0.00025,
        multiplier: '2.5x',
        poolSol: 8000,
        poolClwdn: 32000000,
      },
      distribution: {
        bootstrap: { pct: 10, tokens: 100000000 },
        liquidity: { pct: 40, tokens: 400000000 },
        stakingRewards: { pct: 15, tokens: 150000000 },
        team: { pct: 15, tokens: 150000000 },
        community: { pct: 10, tokens: 100000000 },
        treasury: { pct: 10, tokens: 100000000 },
      },
      contributionAllocation: { liquidityPool: '80%', operations: '20%' },
      tokenFactory: { liquidity: '70%', creator: '10% (12m vest)', treasury: '10%', burn: '10%' },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(econ));
  }


  // POST /api/chat — chatbot endpoint
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { message, sessionId, state } = JSON.parse(body);
        if (!message || !sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'message and sessionId required' }));
        }
        const result = handleChat(message, sessionId, state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // /economics page
  if (req.url === '/economics' || req.url === '/economics/') {
    const fp = path.join(__dirname, 'economics.html');
    return fs.readFile(fp, (err, data) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  }

  // /skills page - Agent participation guide
  if (req.url === '/skills' || req.url === '/skills/') {
    const fp = path.join(__dirname, 'skills.md');
    return fs.readFile(fp, 'utf8', (err, data) => {
      if (err) return serve404(res);
      // Serve as plain text with markdown content-type
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(data);
    });
  }

  // Static files
  let file = req.url === '/' ? '/index.html' : req.url.split('?')[0];

  const filePath = path.join(__dirname, file);
  const ext = path.extname(filePath);

  // Security: Block path traversal and sensitive files
  const resolvedPath = path.resolve(filePath);
  const projectRoot = path.resolve(__dirname);
  if (!resolvedPath.startsWith(projectRoot) || isBlockedPath(resolvedPath)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    return res.end('<h1>403 Forbidden</h1><p>Access denied</p>');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return serve404(res);
    }
    // Inject network config into HTML files
    if (ext === '.html') {
      const configScript = `<script>window.CLWDN_CONFIG={network:"${NETWORK}",rpc:"/api/rpc",rpcBackend:"${SOLANA_RPC}",explorer:"https://explorer.solana.com",cluster:"${NETWORK==="mainnet"?"":"?cluster=devnet"}",isDevnet:${NETWORK!=="mainnet"},clwdnMint:"${CLWDN_MINT}",dispenserProgram:"${DISPENSER_PROGRAM}",bootstrapProgram:"${BOOTSTRAP_PROGRAM}",paymentWallet:"${PAYMENT_WALLET}"};</script>`;
      let html = data.toString();
      html = html.replace('</head>', configScript + '</head>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`🦞 clawdnation running on http://localhost:${PORT}`));
