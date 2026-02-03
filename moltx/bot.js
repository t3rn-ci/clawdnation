/**
 * ClawdNation MoltX Bot
 * 
 * Monitors #clawdnation posts on MoltX, creates tokens,
 * replies with results. Same flow as the Twitter bot.
 * 
 * Usage: node moltx/bot.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createOrder, checkPayments, loadOrders } = require('../solana/payment-monitor');

// Load env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const MOLTX_API_KEY = process.env.MOLTX_API_KEY;
const MOLTX_BASE = 'https://moltx.io/v1';
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
const POLL_INTERVAL = parseInt(process.env.MOLTX_POLL_INTERVAL || '30000'); // 30s
const PROCESSED_PATH = path.join(__dirname, 'processed-posts.json');

if (!MOLTX_API_KEY) {
  console.error('❌ MOLTX_API_KEY not set in .env');
  process.exit(1);
}

// ─── MoltX API helpers ──────────────────────────────────────────────

function moltxRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(MOLTX_BASE + endpoint);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${MOLTX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function moltxPost(content, replyTo = null) {
  const body = { content };
  if (replyTo) {
    body.type = 'reply';
    body.parent_id = replyTo;
  }
  const res = await moltxRequest('POST', '/posts', JSON.stringify(body));
  if (res.status === 200 || res.status === 201) {
    const postId = res.data?.data?.id;
    console.log(`📤 Posted on MoltX: ${content.slice(0, 60)}... (${postId})`);
    return res.data?.data;
  }
  console.error('MoltX post failed:', res.status, JSON.stringify(res.data));
  return null;
}

async function searchHashtag(since = null) {
  // Poll global feed and filter client-side for #clawdnation
  let endpoint = '/feed/global?type=post&limit=50';
  const res = await moltxRequest('GET', endpoint);
  if (res.status === 200) {
    const posts = res.data?.data?.posts || res.data?.data || res.data?.posts || [];
    return posts.filter(p => {
      const content = (p.content || p.text || '').toLowerCase();
      return content.includes('#clawdnation') || content.includes('clawdnation');
    });
  }
  console.error('MoltX search failed:', res.status, JSON.stringify(res.data));
  return [];
}

// ─── Post parsing ───────────────────────────────────────────────────

function parseLaunchRequest(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const data = {};

  for (const line of lines) {
    const match = line.match(/^(\w+)\s*:\s*(.+)$/i);
    if (match) {
      data[match[1].toLowerCase()] = match[2].trim();
    }
  }

  // Extract from freeform text
  if (!data.name) {
    const nameMatch = text.match(/(?:launch|create|make)\s+(?:a\s+)?(?:token\s+)?(?:called\s+|named\s+)?["']?([^"'\n,]+)["']?/i);
    if (nameMatch) data.name = nameMatch[1].trim();
  }
  if (!data.symbol) {
    const symMatch = text.match(/\$([A-Z]{2,10})/);
    if (symMatch) data.symbol = symMatch[1];
  }
  if (!data.wallet) {
    const walletMatch = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (walletMatch) data.wallet = walletMatch[1];
  }

  return data;
}

// ─── Processed posts tracking ───────────────────────────────────────

function getProcessed() {
  if (!fs.existsSync(PROCESSED_PATH)) return { posts: {} };
  try { return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8')); }
  catch { return { posts: {} }; }
}

function saveProcessed(data) {
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(data, null, 2));
}

// ─── Main bot loop ──────────────────────────────────────────────────

async function pollMoltX() {
  const processed = getProcessed();

  try {
    const posts = await searchHashtag();
    if (!posts.length) return;

    for (const p of posts) {
      const postId = p.id;
      if (!postId) continue;

      // Skip if already processed
      if (processed.posts[postId]) continue;

      // Skip our own posts
      const authorName = p.agent?.name || p.author?.name || '';
      if (authorName === 'ClawdNation_bot') continue;

      const text = p.content || p.text || '';
      console.log(`\n🔍 New MoltX post: ${postId} by ${authorName}`);
      console.log(`   ${text.slice(0, 100)}...`);

      // Parse launch request
      const data = parseLaunchRequest(text);

      if (!data.name && !data.symbol) {
        console.log('   Skipping — no token details found');
        processed.posts[postId] = { status: 'skipped', reason: 'no_details', at: new Date().toISOString() };
        saveProcessed(processed);
        continue;
      }

      if (!data.symbol) data.symbol = data.name.replace(/[^A-Z]/gi, '').slice(0, 5).toUpperCase();
      if (!data.name) data.name = data.symbol;

      console.log(`   Token: ${data.name} ($${data.symbol})`);
      console.log(`   From: @${authorName}`);
      console.log(`   Wallet: ${data.wallet || 'none provided'}`);

      // Create order
      const order = createOrder({
        source: 'moltx',
        sourceId: postId,
        sourceAuthor: authorName,
        name: data.name,
        symbol: data.symbol,
        description: data.description || `${data.name} — launched via ClawdNation on MoltX`,
        image: data.image,
        recipientWallet: data.wallet || PAYMENT_ADDRESS,
      });

      // Reply with payment info
      const replyText = `🦞 @${authorName} — got your launch request for $${data.symbol}!

Send ${order.requiredSol} SOL to:
${PAYMENT_ADDRESS}

Your token will be created automatically after payment confirms.

Order: #${order.id}

#clawdnation`;

      const reply = await moltxPost(replyText, postId);

      processed.posts[postId] = {
        status: 'replied',
        orderId: order.id,
        replyId: reply?.id,
        symbol: data.symbol,
        at: new Date().toISOString(),
      };
      saveProcessed(processed);
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

async function checkCompletedOrders() {
  const orders = loadOrders();
  const completed = orders.filter(o => o.status === 'completed' && o.source === 'moltx' && !o.moltxPosted);

  for (const order of completed) {
    const NETWORK = process.env.NETWORK || 'devnet';
    const cluster = NETWORK === 'mainnet' ? '' : `?cluster=${NETWORK}`;
    const replyText = `🦞 Token created! $${order.symbol}

Mint: ${order.tokenMint}
Explorer: https://explorer.solana.com/address/${order.tokenMint}${cluster}

Launched on ClawdNation 🏭
https://clawdnation.com`;

    const processed = getProcessed();
    const postData = processed.posts[order.sourceId];
    const replyTo = postData?.replyId || order.sourceId;

    await moltxPost(replyText, replyTo);
    order.moltxPosted = true;
  }

  if (completed.length) {
    const updatedOrders = loadOrders();
    for (const c of completed) {
      const idx = updatedOrders.findIndex(o => o.id === c.id);
      if (idx >= 0) updatedOrders[idx].moltxPosted = true;
    }
    fs.writeFileSync(
      path.join(__dirname, '..', 'solana', 'orders.json'),
      JSON.stringify(updatedOrders, null, 2)
    );
  }
}

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🦞 ClawdNation MoltX Bot              ║');
  console.log('║  Monitoring #clawdnation on MoltX      ║');
  console.log(`║  Payment: ${PAYMENT_ADDRESS.slice(0, 20)}...  ║`);
  console.log('╚════════════════════════════════════════╝');

  // Poll MoltX for new posts
  setInterval(pollMoltX, POLL_INTERVAL);
  pollMoltX();

  // Check payments
  setInterval(checkPayments, 10000);

  // Check for completed orders to post about
  setInterval(checkCompletedOrders, 15000);

  console.log(`\n🔄 Polling every ${POLL_INTERVAL / 1000}s\n`);
}

main().catch(e => {
  console.error('Bot error:', e.message);
  process.exit(1);
});
