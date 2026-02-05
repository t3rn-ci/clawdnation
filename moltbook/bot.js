/**
 * ClawdNation Moltbook Bot
 * 
 * Monitors #clawdnation posts on Moltbook, handles airdrop wallet registration.
 * Replies asking for Solana wallet, saves wallets to airdrop database.
 * 
 * Usage: node moltbook/bot.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { handleMention, handleWalletReply } = require('../twitter/airdrop-handler');

// Load env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;
const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1'; // MUST use www
const POLL_INTERVAL = parseInt(process.env.MOLTBOOK_POLL_INTERVAL || '60000'); // 60s
const PROCESSED_PATH = path.join(__dirname, 'processed-posts.json');
const OUR_AGENT_NAME = process.env.MOLTBOOK_AGENT_NAME || 'clwdn';

if (!MOLTBOOK_API_KEY) {
  console.error('❌ MOLTBOOK_API_KEY not set in .env');
  process.exit(1);
}

// ─── Moltbook API helpers ──────────────────────────────────────────

function moltbookRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(MOLTBOOK_BASE + endpoint);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${MOLTBOOK_API_KEY}`,
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

async function moltbookComment(postId, content) {
  const body = JSON.stringify({ content });
  const res = await moltbookRequest('POST', `/posts/${postId}/comments`, body);
  if (res.status === 200 || res.status === 201) {
    const commentId = res.data?.data?.id || res.data?.id;
    console.log(`📤 Commented on Moltbook post ${postId}: ${content.slice(0, 60)}... (${commentId})`);
    return res.data?.data || res.data;
  }
  console.error('Moltbook comment failed:', res.status, JSON.stringify(res.data));
  return null;
}

async function moltbookPost(submolt, title, content) {
  const body = JSON.stringify({ submolt, title, content });
  const res = await moltbookRequest('POST', '/posts', body);
  if (res.status === 200 || res.status === 201) {
    const postId = res.data?.data?.id || res.data?.id;
    console.log(`📤 Posted on Moltbook: ${title} (${postId})`);
    return res.data?.data || res.data;
  }
  console.error('Moltbook post failed:', res.status, JSON.stringify(res.data));
  return null;
}

async function searchPosts(query) {
  const res = await moltbookRequest('GET', `/search?q=${encodeURIComponent(query)}&type=posts&limit=25`);
  if (res.status === 200) {
    return res.data?.data?.posts || res.data?.data || res.data?.posts || [];
  }
  console.error('Moltbook search failed:', res.status, JSON.stringify(res.data));
  return [];
}

async function getFeed() {
  const res = await moltbookRequest('GET', '/posts?sort=new&limit=50');
  if (res.status === 200) {
    const posts = res.data?.data?.posts || res.data?.data || res.data?.posts || [];
    return posts.filter(p => {
      const content = ((p.content || '') + ' ' + (p.title || '')).toLowerCase();
      return content.includes('#clawdnation') || content.includes('clawdnation');
    });
  }
  console.error('Moltbook feed failed:', res.status, JSON.stringify(res.data));
  return [];
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

async function pollMoltbook() {
  const processed = getProcessed();

  try {
    // Try search first, fall back to feed
    let posts = await searchPosts('clawdnation');
    if (!posts.length) posts = await getFeed();
    if (!posts.length) return;

    for (const p of posts) {
      const postId = p.id || p._id;
      if (!postId) continue;

      // Skip if already processed
      if (processed.posts[postId]) continue;

      // Skip our own posts
      const authorName = p.author?.name || p.agent?.name || p.author || '';
      if (authorName.toLowerCase() === OUR_AGENT_NAME.toLowerCase() || 
          authorName.toLowerCase() === 'clawdnation') continue;

      const text = (p.content || '') + ' ' + (p.title || '');
      console.log(`\n🔍 New Moltbook post: ${postId} by ${authorName}`);
      console.log(`   ${text.slice(0, 100)}...`);

      // Handle as airdrop mention
      const airdropResult = handleMention({ text, author_id: authorName, id: postId }, authorName);
      
      if (airdropResult && airdropResult.reply) {
        const reply = await moltbookComment(postId, airdropResult.reply);
        console.log('   Airdrop:', airdropResult.action, reply ? '(commented)' : '(failed)');
        processed.posts[postId] = { 
          status: 'airdrop_' + airdropResult.action,
          replyId: reply?.id,
          at: new Date().toISOString()
        };
      } else {
        processed.posts[postId] = { status: 'airdrop_no_reply', at: new Date().toISOString() };
      }
      saveProcessed(processed);
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🔴 ClawdNation Moltbook Bot           ║');
  console.log('║  Monitoring #clawdnation on Moltbook   ║');
  console.log('╚════════════════════════════════════════╝');

  setInterval(pollMoltbook, POLL_INTERVAL);
  pollMoltbook();

  console.log(`\n🔄 Polling every ${POLL_INTERVAL / 1000}s\n`);
}

main().catch(e => {
  console.error('Bot error:', e.message);
  process.exit(1);
});
