/**
 * Delete test tweets via Twitter API v2 (OAuth 1.0a)
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

const CK = process.env.X_CONSUMER_KEY;
const CS = process.env.X_CONSUMER_SECRET;
const AT = process.env.X_ACCESS_TOKEN;
const AS = process.env.X_ACCESS_SECRET;

function pe(s) { return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }

function sign(method, url, params) {
  const sp = Object.keys(params).sort().map(k => pe(k) + '=' + pe(params[k])).join('&');
  const bs = method + '&' + pe(url) + '&' + pe(sp);
  return crypto.createHmac('sha1', pe(CS) + '&' + pe(AS)).update(bs).digest('base64');
}

function oauthHeader(method, url) {
  const p = {
    oauth_consumer_key: CK, oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: AT, oauth_version: '1.0',
  };
  p.oauth_signature = sign(method, url, p);
  return 'OAuth ' + Object.keys(p).sort().map(k => pe(k) + '="' + pe(p[k]) + '"').join(', ');
}

function deleteTweet(tweetId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.x.com/2/tweets/${tweetId}`;
    const req = https.request(url, {
      method: 'DELETE',
      headers: { 'Authorization': oauthHeader('DELETE', url) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`  ${tweetId}: ${res.statusCode} ${data}`);
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const TWEET_IDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
    '2018276637565915186',
    '2018276710781694019',
    '2018276961903124629',
  ];

(async () => {
  console.log(`Deleting ${TWEET_IDS.length} tweets...\n`);
  for (const id of TWEET_IDS) {
    try {
      await deleteTweet(id);
    } catch (e) {
      console.error(`  ${id}: ERROR ${e.message}`);
    }
  }
  console.log('\nDone.');
})();
