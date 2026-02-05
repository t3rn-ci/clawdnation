/**
 * Airdrop Tweet Handler
 * 
 * Integrated into the Twitter bot to:
 * 1. Detect #clawdnation mentions
 * 2. Reply asking for Solana wallet (or SOL contribution)
 * 3. Watch for wallet replies and register them
 */

const { registerWallet, isRegistered } = require('./airdrop-db');

// Solana address regex
const SOLANA_RE = /([1-9A-HJ-NP-Za-km-z]{32,44})/;

/**
 * Check if a tweet contains a Solana wallet address
 */
function extractWallet(text) {
  const match = text.match(SOLANA_RE);
  if (!match) return null;
  // Filter out common false positives (short base58 strings that aren't wallets)
  if (match[1].length < 32) return null;
  return match[1];
}

/**
 * Handle a new #clawdnation tweet
 * Returns reply text or null if no reply needed
 */
function handleMention(tweet, username) {
  const wallet = extractWallet(tweet.text);
  
  if (wallet) {
    // Tweet already contains a wallet — register it directly
    const result = registerWallet({
      wallet,
      twitterHandle: username,
      twitterId: tweet.author_id,
      tweetId: tweet.id,
      source: 'twitter'
    });

    if (result.isNew) {
      return {
        action: 'registered',
        reply: `🔴 @${username} wallet registered for the $CLWDN airdrop!

${wallet.slice(0, 6)}...${wallet.slice(-4)} is now in the drop list.

100,000,000 CLWDN will be distributed to all registered wallets.

Track your status: https://clawdnation.com#airdrop`
      };
    } else {
      return {
        action: 'already_registered',
        reply: `@${username} this wallet is already registered for the airdrop! ✅

Check status: https://clawdnation.com#airdrop`
      };
    }
  }

  // No wallet in tweet — ask for one
  return {
    action: 'ask_wallet',
    reply: `🔴 @${username} welcome to #ClawdNation!

Drop your Solana wallet address to register for the $CLWDN airdrop — or send SOL to help build the ecosystem:

GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE

100M CLWDN distributed to all registered wallets.

https://clawdnation.com#airdrop`
  };
}

/**
 * Handle a reply to our airdrop ask (someone replying with their wallet)
 */
function handleWalletReply(tweet, username) {
  const wallet = extractWallet(tweet.text);
  if (!wallet) return null;

  const result = registerWallet({
    wallet,
    twitterHandle: username,
    twitterId: tweet.author_id,
    tweetId: tweet.id,
    source: 'twitter'
  });

  if (result.isNew) {
    return {
      action: 'registered',
      reply: `🔴 @${username} you're in! 

${wallet.slice(0, 6)}...${wallet.slice(-4)} registered for the $CLWDN airdrop.

https://clawdnation.com#airdrop`
    };
  }
  
  return {
    action: 'already_registered',
    reply: null // Don't reply again if already registered
  };
}

module.exports = { handleMention, handleWalletReply, extractWallet };
