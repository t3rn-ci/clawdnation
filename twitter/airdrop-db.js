/**
 * Airdrop Wallet Database
 * 
 * Stores wallets from Twitter #clawdnation mentions.
 * Simple JSON file storage with dedup by wallet address.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'airdrop-wallets.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) return { wallets: [], byWallet: {}, byTwitter: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { wallets: [], byWallet: {}, byTwitter: {} };
  }
}

function save(db) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/**
 * Register a wallet for the airdrop
 * @param {object} entry
 * @param {string} entry.wallet - Solana public key
 * @param {string} entry.twitterHandle - @username (without @)
 * @param {string} entry.twitterId - numeric user ID
 * @param {string} entry.tweetId - tweet where wallet was submitted
 * @param {string} entry.source - 'twitter' | 'website' | 'manual'
 * @returns {{ success: boolean, message: string, isNew: boolean }}
 */
function registerWallet({ wallet, twitterHandle, twitterId, tweetId, source = 'twitter' }) {
  if (!wallet || !wallet.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    return { success: false, message: 'Invalid Solana wallet address', isNew: false };
  }

  const db = load();
  
  // Check if wallet already registered
  if (db.byWallet[wallet]) {
    const existing = db.byWallet[wallet];
    return { 
      success: true, 
      message: `Wallet already registered (by @${existing.twitterHandle || 'unknown'})`, 
      isNew: false,
      entry: existing
    };
  }

  const entry = {
    wallet,
    twitterHandle: twitterHandle || null,
    twitterId: twitterId || null,
    tweetId: tweetId || null,
    source,
    registeredAt: new Date().toISOString(),
    registeredTs: Date.now()
  };

  db.wallets.push(entry);
  db.byWallet[wallet] = entry;
  if (twitterHandle) db.byTwitter[twitterHandle.toLowerCase()] = entry;
  
  save(db);
  
  return { success: true, message: 'Wallet registered for airdrop', isNew: true, entry };
}

/**
 * Get all registered wallets
 * @returns {Array} wallet entries
 */
function getWallets() {
  const db = load();
  return db.wallets;
}

/**
 * Get wallet count
 */
function getCount() {
  const db = load();
  return db.wallets.length;
}

/**
 * Check if a wallet or twitter handle is registered
 */
function isRegistered(walletOrHandle) {
  const db = load();
  if (walletOrHandle.startsWith('@')) {
    return db.byTwitter[walletOrHandle.slice(1).toLowerCase()] || null;
  }
  return db.byWallet[walletOrHandle] || null;
}

module.exports = { registerWallet, getWallets, getCount, isRegistered, DB_PATH };
