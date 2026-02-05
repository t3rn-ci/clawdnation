#!/usr/bin/env node
/**
 * Self-Birth Trigger
 * 
 * Posts the genesis tweet and lets the bot pick it up.
 * The bot detects it as a self-birth tweet and executes the full flow.
 * 
 * Usage: node self-birth-trigger.js [--dry-run]
 */

const path = require("path");
const fs = require("fs");

// Load env
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const [k,...v] = line.split("=");
    if (k && !k.startsWith("#") && v.length) process.env[k.trim()] = v.join("=").trim();
  });
}

const { GENESIS_TWEET } = require("./solana/self-birth");

const isDryRun = process.argv.includes("--dry-run");

// Reuse bot tweet function
const crypto = require("crypto");
const https = require("https");
const CK = process.env.X_CONSUMER_KEY;
const CS = process.env.X_CONSUMER_SECRET;
const AT = process.env.X_ACCESS_TOKEN;
const AS = process.env.X_ACCESS_SECRET;

function pe(s) { return encodeURIComponent(s).replace(/[!\x27()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()); }
function sign(method, url, params) {
  const sp = Object.keys(params).sort().map(k => pe(k) + "=" + pe(params[k])).join("&");
  return crypto.createHmac("sha1", pe(CS) + "&" + pe(AS)).update(method + "&" + pe(url) + "&" + pe(sp)).digest("base64");
}

async function postTweet(text) {
  const url = "https://api.x.com/2/tweets";
  const p = {
    oauth_consumer_key: CK, oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now()/1000).toString(),
    oauth_token: AT, oauth_version: "1.0",
  };
  p.oauth_signature = sign("POST", url, p);
  const auth = "OAuth " + Object.keys(p).sort().map(k => pe(k) + "=\"" + pe(p[k]) + "\"").join(", ");
  
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const req = https.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": auth, "Content-Length": Buffer.byteLength(body) },
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  🦞 CLWDN SELF-BIRTH TRIGGER                    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("Genesis tweet:\n");
  console.log("  " + GENESIS_TWEET.split("\n").join("\n  "));
  console.log();

  if (isDryRun) {
    console.log("🔍 DRY RUN — tweet NOT posted");
    console.log("   Remove --dry-run to post for real");
    return;
  }

  console.log("📤 Posting genesis tweet...\n");
  const res = await postTweet(GENESIS_TWEET);
  
  if (res.status === 201) {
    console.log("✅ Genesis tweet posted!");
    console.log("   Tweet ID:", res.data.data.id);
    console.log("   URL: https://x.com/clawdnation/status/" + res.data.data.id);
    console.log();
    console.log("⏳ The bot will pick this up within 30s and execute self-birth.");
    console.log("   Monitor: journalctl -u clawdnation-bot -f");
  } else {
    console.error("❌ Failed to post:", res.status, JSON.stringify(res.data));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
