/**
 * ClawdNation Twitter/X Poster via OAuth 1.0a API
 * 
 * Usage: node tweet.js "Your tweet text"
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.twitter');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const CONSUMER_KEY = process.env.X_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.X_CONSUMER_SECRET;
const ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const ACCESS_SECRET = process.env.X_ACCESS_SECRET;

const TWEET = process.argv[2] || process.env.TWEET;
const REPLY_TO = process.argv[3] || null;

if (!TWEET) {
  console.error('Usage: node tweet.js "Your tweet text"');
  process.exit(1);
}

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateOAuthSignature(method, url, params) {
  const sortedParams = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(ACCESS_SECRET)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function buildOAuthHeader(method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: '1.0',
    ...extraParams,
  };

  const signature = generateOAuthSignature(method, url, oauthParams);
  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(', ');
  return header;
}

async function tweet(text) {
  const url = 'https://api.x.com/2/tweets';
  const payload = { text };
  if (REPLY_TO) payload.reply = { in_reply_to_tweet_id: REPLY_TO };
  const body = JSON.stringify(payload);
  const authHeader = buildOAuthHeader('POST', url);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        try {
          const json = JSON.parse(data);
          console.log(JSON.stringify(json, null, 2));
          if (res.statusCode === 201) {
            console.log(`\n✅ Tweet posted! https://x.com/i/status/${json.data.id}`);
            resolve(json);
          } else {
            console.error('\n❌ Failed to post tweet');
            reject(new Error(data));
          }
        } catch (e) {
          console.log('Raw response:', data);
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

tweet(TWEET).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
