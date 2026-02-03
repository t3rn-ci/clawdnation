/**
 * ClawdNation Twitter Bot
 * 
 * Monitors #clawdnation tweets, replies with payment info,
 * watches for payments, creates tokens, replies with result.
 * 
 * Usage: node twitter/bot.js
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createOrder, checkPayments, loadOrders } = require('../solana/payment-monitor');
const { createToken } = require('../solana/token-factory');

// Self-birth module
const { BOT_USER_ID, isSelfBirthTweet, executeSelfBirth, GENESIS_TWEET } = require("../solana/self-birth");
const { Keypair } = require("@solana/web3.js");
let authority = null;
try {
  const authorityKey = JSON.parse(fs.readFileSync(process.env.AUTHORITY_KEYPAIR || "/root/.config/solana/clawdnation.json", "utf8"));
  authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));
  console.log("🔑 Self-birth enabled:", authority.publicKey.toBase58().slice(0,16) + "...");
} catch(e) { console.warn("⚠️ Self-birth disabled:", e.message); }

// Load env
// Load from .env first, then .env.twitter as fallback
const envFiles = [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '.env.twitter')];
const envPath = envFiles.find(f => fs.existsSync(f));
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith("#") && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const CK = process.env.X_CONSUMER_KEY;
const CS = process.env.X_CONSUMER_SECRET;
const AT = process.env.X_ACCESS_TOKEN;
const AS = process.env.X_ACCESS_SECRET;
const BEARER = decodeURIComponent(process.env.X_BEARER_TOKEN || '');
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
const NETWORK = process.env.NETWORK || 'devnet';
const SEARCH_INTERVAL = parseInt(process.env.SEARCH_INTERVAL || '30000'); // 30s
const PROCESSED_PATH = path.join(__dirname, 'processed-tweets.json');

// ─── OAuth 1.0a helpers ──────────────────────────────────────────────

function pe(s) { return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }

function sign(method, url, params) {
  const sp = Object.keys(params).sort().map(k => pe(k) + '=' + pe(params[k])).join('&');
  const bs = method + '&' + pe(url) + '&' + pe(sp);
  return crypto.createHmac('sha1', pe(CS) + '&' + pe(AS)).update(bs).digest('base64');
}

function oauthHeader(method, url, extra = {}) {
  const p = {
    oauth_consumer_key: CK, oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: AT, oauth_version: '1.0', ...extra,
  };
  p.oauth_signature = sign(method, url, p);
  return 'OAuth ' + Object.keys(p).sort().map(k => pe(k) + '="' + pe(p[k]) + '"').join(', ');
}

// ─── Twitter API calls ──────────────────────────────────────────────

function apiRequest(method, url, body = null, useBearer = false) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': useBearer ? `Bearer ${BEARER}` : oauthHeader(method, url),
    };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(url, { method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function tweet(text, replyTo = null) {
  const url = 'https://api.x.com/2/tweets';
  const body = { text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
  const res = await apiRequest('POST', url, JSON.stringify(body));
  if (res.status === 201) {
    console.log(`📤 Tweeted: ${text.slice(0, 60)}... (${res.data.data.id})`);
    return res.data.data;
  }
  console.error('Tweet failed:', res.status, JSON.stringify(res.data));
  return null;
}

async function searchTweets(query, sinceId = null) {
  let url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=author_id,text,created_at`;
  if (sinceId) url += `&since_id=${sinceId}`;
  const res = await apiRequest('GET', url, null, true);
  return res.data?.data || [];
}

async function getUserById(userId) {
  const url = `https://api.x.com/2/users/${userId}`;
  const res = await apiRequest('GET', url, null, true);
  return res.data?.data;
}

// ─── Tweet parsing ──────────────────────────────────────────────────

function parseLaunchRequest(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const data = {};

  for (const line of lines) {
    const match = line.match(/^(\w+)\s*:\s*(.+)$/i);
    if (match) {
      data[match[1].toLowerCase()] = match[2].trim();
    }
  }

  // Also try to extract from freeform text
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

// ─── Processed tweets tracking ──────────────────────────────────────

function getProcessed() {
  if (!fs.existsSync(PROCESSED_PATH)) return { lastId: null, tweets: {} };
  return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
}

function saveProcessed(data) {
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(data, null, 2));
}

// ─── Main bot loop ──────────────────────────────────────────────────

async function pollTwitter() {
  const processed = getProcessed();

  try {
    const tweets = await searchTweets('#clawdnation', processed.lastId);
    if (!tweets.length) return;

    // Update lastId
    processed.lastId = tweets[0].id;

    for (const t of tweets) {
      // Skip if already processed
      if (processed.tweets[t.id]) continue;

      // Skip own tweets UNLESS they're token launch requests (self-birth handled separately)
      if (t.author_id === BOT_USER_ID) {
        const hasTokenFormat = /name:|symbol:/i.test(t.text);
        if (!hasTokenFormat) {
          console.log(`\n⏭️  Skipping own marketing tweet: ${t.id}`);
          processed.tweets[t.id] = { status: 'skipped', reason: 'own_marketing' };
          saveProcessed(processed);
          continue;
        }
        console.log(`\n🦞 Processing own launch request: ${t.id}`);
      }

      console.log(`\n🔍 New tweet: ${t.id} by ${t.author_id}`);
      console.log(`   ${t.text.slice(0, 100)}...`);

      // Parse launch request
      const data = parseLaunchRequest(t.text);


      // Self-birth: bot detects its own genesis tweet
      if (isSelfBirthTweet(t) && authority) {
        console.log("🦞 SELF-BIRTH TWEET DETECTED!");
        processed.tweets[t.id] = { status: "self-birth", started: Date.now() };
        saveProcessed(processed);
        const result = await executeSelfBirth(authority, tweet, t.id);
        processed.tweets[t.id].status = result.success ? "self-birth-complete" : "self-birth-failed";
        processed.tweets[t.id].result = result;
        saveProcessed(processed);
        continue;
      }

      if (!data.name && !data.symbol) {
        console.log('   Skipping — no token details found');
        processed.tweets[t.id] = { status: 'skipped', reason: 'no_details' };
        saveProcessed(processed);
        continue;
      }

      if (!data.symbol) data.symbol = data.name.replace(/[^A-Z]/gi, '').slice(0, 5).toUpperCase();
      if (!data.name) data.name = data.symbol;

      // Get user info
      const user = await getUserById(t.author_id);
      const username = user ? `@${user.username}` : t.author_id;

      console.log(`   Token: ${data.name} ($${data.symbol})`);
      console.log(`   From: ${username}`);
      console.log(`   Wallet: ${data.wallet || 'none provided'}`);

      // Create order
      const order = createOrder({
        tweetId: t.id,
        tweetAuthor: username,
        name: data.name,
        symbol: data.symbol,
        description: data.description || `${data.name} — launched via ClawdNation`,
        image: data.image,
        recipientWallet: data.wallet || PAYMENT_ADDRESS,
      });

      // Reply with payment info
      const replyText = `🔴 @${user?.username || 'anon'} — got your launch request for $${data.symbol}!

Send ${order.requiredSol} SOL to:
${PAYMENT_ADDRESS}

Your token will be created automatically after payment confirms.

Order: #${order.id}`;

      const reply = await tweet(replyText, t.id);

      processed.tweets[t.id] = {
        status: 'replied',
        orderId: order.id,
        replyId: reply?.id,
        symbol: data.symbol,
      };
      saveProcessed(processed);
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

async function checkCompletedOrders() {
  const orders = loadOrders();
  const completed = orders.filter(o => o.status === 'completed' && !o.tweeted);
  
  for (const order of completed) {
    const replyText = `🔴 Token created! $${order.symbol}

Mint: ${order.tokenMint}
Explorer: ${order.tokenExplorer}

Launched on ClawdNation 🏭
https://clawdnation.com`;

    // Find the original reply tweet to thread under
    const processed = getProcessed();
    const tweetData = processed.tweets[order.tweetId];
    const replyTo = tweetData?.replyId || order.tweetId;

    await tweet(replyText, replyTo);
    order.tweeted = true;
  }

  if (completed.length) {
    const updatedOrders = loadOrders();
    for (const c of completed) {
      const idx = updatedOrders.findIndex(o => o.id === c.id);
      if (idx >= 0) updatedOrders[idx].tweeted = true;
    }
    fs.writeFileSync(path.join(__dirname, '..', 'solana', NETWORK === 'mainnet' ? 'orders-mainnet.json' : 'orders.json'), JSON.stringify(updatedOrders, null, 2));
  }
}

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🔴 ClawdNation Twitter Bot            ║');
  console.log('║  Monitoring #clawdnation               ║');
  console.log(`║  Payment: ${PAYMENT_ADDRESS.slice(0, 20)}...  ║`);
  console.log('╚════════════════════════════════════════╝');

  // Poll Twitter for new mentions
  setInterval(pollTwitter, SEARCH_INTERVAL);
  pollTwitter().catch(e => console.error("Poll error:", e.message || e));

  // Check payments
  setInterval(checkPayments, 60000);

  // Check for completed orders to tweet about
  setInterval(checkCompletedOrders, 15000);

  console.log(`\n🔄 Polling every ${SEARCH_INTERVAL / 1000}s\n`);
}

main().catch(e => {
  console.error('Bot error:', e.message);
  process.exit(1);
});
