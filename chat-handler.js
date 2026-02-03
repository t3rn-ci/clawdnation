/**
 * Chat Handler — rule-based bot responses for the ClawdNation chat widget
 */

const PAYMENT_WALLET = process.env.PAYMENT_ADDRESS || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
const NETWORK = process.env.NETWORK || 'devnet';
const CLWDN_MINT = NETWORK === 'mainnet' ? '3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG' : 'Dm5fvVbBFxS3ivM5PUfc6nTccxK5nLcLs4aZKnPdjujj';

// Session state storage (in-memory, keyed by sessionId)
const sessions = {};

function getSession(sessionId) {
  if (!sessions[sessionId]) sessions[sessionId] = { flow: null, step: null, data: {} };
  return sessions[sessionId];
}

/**
 * Process a chat message and return bot response(s)
 * @param {string} message - User's message
 * @param {string} sessionId - Session identifier
 * @param {object} clientState - Client-side state (flow, step, data)
 * @returns {{ replies: string[], state: object }}
 */
function handleChat(message, sessionId, clientState) {
  const msg = message.toLowerCase().trim();
  // Use client state if provided, fall back to server sessions
  let state = clientState && clientState.flow ? clientState : getSession(sessionId);

  // Check if we're in a flow
  if (state.flow === 'token_create') {
    return handleTokenFlow(msg, message, state, sessionId);
  }
  if (state.flow === 'bootstrap') {
    return handleBootstrapFlow(msg, message, state, sessionId);
  }

  // Pattern matching for new intents
  if (matches(msg, ['launch', 'create', 'deploy', 'make'], ['token', 'coin', 'meme'])) {
    return startTokenFlow(msg, message, sessionId);
  }

  if (matches(msg, ['invest', 'buy', 'contribute', 'bootstrap', 'purchase'], ['clwdn', 'sol', 'token', 'invest', 'buy', 'contribute', 'bootstrap', 'purchase'])) {
    return startBootstrapFlow(sessionId);
  }

  if (matchesAny(msg, ['help', 'what can you do', 'options', 'menu', 'commands'])) {
    return { replies: [helpMessage()], state: resetState(sessionId) };
  }

  if (matchesAny(msg, ['what is clawdnation', 'about', 'explain', 'how does it work', 'what is this'])) {
    return { replies: [aboutMessage()], state: resetState(sessionId) };
  }

  if (matchesAny(msg, ['stake', 'staking', 'yield', 'apy', 'rewards'])) {
    return { replies: [stakingMessage()], state: resetState(sessionId) };
  }

  if (matchesAny(msg, ['airdrop', 'free', 'claim'])) {
    return { replies: [airdropMessage()], state: resetState(sessionId) };
  }

  if (matchesAny(msg, ['price', 'value', 'worth', 'market'])) {
    return { replies: [priceMessage()], state: resetState(sessionId) };
  }

  if (matchesAny(msg, ['social', 'twitter', 'follow', 'community', 'discord', 'moltx', 'moltbook'])) {
    return { replies: [socialMessage()], state: resetState(sessionId) };
  }

  if (matchesAny(msg, ['hi', 'hello', 'hey', 'gm', 'sup', 'yo'])) {
    return { replies: [greetingMessage()], state: resetState(sessionId) };
  }

  // Default
  return { replies: [defaultMessage()], state: resetState(sessionId) };
}

// --- Token Creation Flow ---

function startTokenFlow(msg, original, sessionId) {
  // Try to extract name and symbol from the message
  const parsed = parseTokenInfo(original);

  if (parsed.name && parsed.symbol) {
    const state = { flow: 'token_create', step: 'confirm', data: { name: parsed.name, symbol: parsed.symbol.toUpperCase() } };
    sessions[sessionId] = state;
    return {
      replies: [
        `🚀 Great! Let's create <strong>$${esc(state.data.symbol)}</strong> (${esc(state.data.name)})!<br><br>` +
        `Token creation costs <strong>0.05 SOL</strong>. The token will be created with:<br>` +
        `• 1B supply (Token-2022)<br>` +
        `• 70% to liquidity, 10% to you (12m vest), 10% treasury, 10% burned<br><br>` +
        `Ready to proceed?<br>` +
        `<div class="chat-options">` +
        `<span class="chat-option" onclick="window._cwChat.quickSend('Yes, create it')">✅ Yes, create it</span>` +
        `<span class="chat-option" onclick="window._cwChat.quickSend('Cancel')">❌ Cancel</span>` +
        `</div>`
      ],
      state
    };
  }

  const state = { flow: 'token_create', step: 'name', data: {} };
  sessions[sessionId] = state;
  return {
    replies: [
      `🚀 Let's create a token! What would you like to name it?<br><br>` +
      `You can say something like: <em>"DogeCoin with symbol DOGE"</em> or just tell me the name and I'll ask for the rest.`
    ],
    state
  };
}

function handleTokenFlow(msg, original, state, sessionId) {
  if (matchesAny(msg, ['cancel', 'nevermind', 'stop', 'quit', 'exit'])) {
    return { replies: ['No worries! Let me know if you change your mind. 🦞'], state: resetState(sessionId) };
  }

  if (state.step === 'name') {
    const parsed = parseTokenInfo(original);
    if (parsed.name && parsed.symbol) {
      state.data.name = parsed.name;
      state.data.symbol = parsed.symbol.toUpperCase();
      state.step = 'confirm';
      sessions[sessionId] = state;
      return {
        replies: [
          `Got it! <strong>$${esc(state.data.symbol)}</strong> (${esc(state.data.name)})<br><br>` +
          `Cost: <strong>0.05 SOL</strong><br>` +
          `Ready to create?<br>` +
          `<div class="chat-options">` +
          `<span class="chat-option" onclick="window._cwChat.quickSend('Yes, create it')">✅ Yes</span>` +
          `<span class="chat-option" onclick="window._cwChat.quickSend('Cancel')">❌ Cancel</span>` +
          `</div>`
        ],
        state
      };
    }
    state.data.name = original.trim();
    state.step = 'symbol';
    sessions[sessionId] = state;
    return { replies: [`Nice name! What symbol/ticker should it have? (e.g., DOGE, PEPE, MOON)`], state };
  }

  if (state.step === 'symbol') {
    state.data.symbol = original.trim().replace(/^\$/, '').toUpperCase().slice(0, 10);
    state.step = 'confirm';
    sessions[sessionId] = state;
    return {
      replies: [
        `Perfect! Creating <strong>$${esc(state.data.symbol)}</strong> (${esc(state.data.name)})<br><br>` +
        `Cost: <strong>0.05 SOL</strong> → sent to <code>${PAYMENT_WALLET.slice(0,8)}...</code><br><br>` +
        `Ready?<br>` +
        `<div class="chat-options">` +
        `<span class="chat-option" onclick="window._cwChat.quickSend('Yes, create it')">✅ Create it</span>` +
        `<span class="chat-option" onclick="window._cwChat.quickSend('Cancel')">❌ Cancel</span>` +
        `</div>`
      ],
      state
    };
  }

  if (state.step === 'confirm') {
    if (matchesAny(msg, ['yes', 'ok', 'sure', 'create', 'do it', 'go', 'proceed', 'confirm', 'let\'s go'])) {
      // Create order via payment monitor
      let orderId = null;
      try {
        const { createOrder } = require('./solana/payment-monitor');
        const order = createOrder({
          tweetId: 'web_' + Date.now().toString(36),
          tweetAuthor: 'web_user_' + sessionId.slice(0, 8),
          name: state.data.name,
          symbol: state.data.symbol,
          description: state.data.name + ' — created via ClawdNation',
          image: null,
          recipientWallet: null, // Will be set when wallet connects
        });
        orderId = order.id;
      } catch (e) {
        console.error('Chat: createOrder failed:', e.message);
      }

      state.step = 'pay';
      state.data.orderId = orderId;
      sessions[sessionId] = state;

      return {
        replies: [
          `💳 To create <strong>$${esc(state.data.symbol)}</strong>, send <strong>0.05 SOL</strong> to:<br><br>` +
          `<code>${PAYMENT_WALLET}</code><br><br>` +
          `Connect your wallet and click Pay below:<br>` +
          `<button class="chat-btn" onclick="window._cwChat.payToken()">💰 Pay 0.05 SOL</button>`
        ],
        state
      };
    }
  }

  return { replies: [defaultMessage()], state: resetState(sessionId) };
}

// --- Bootstrap Flow ---

function startBootstrapFlow(sessionId) {
  const state = { flow: 'bootstrap', step: 'amount', data: {} };
  sessions[sessionId] = state;
  return {
    replies: [
      `💰 Welcome to the <strong>CLWDN Bootstrap</strong>!<br><br>` +
      `Rate: <strong>1 SOL = 10,000 CLWDN</strong> (0.0001 SOL/CLWDN)<br><br>` +
      `How much SOL would you like to contribute?<br>` +
      `<div class="chat-options">` +
      `<span class="chat-option" onclick="window._cwChat.quickSend('0.1 SOL')">0.1 SOL</span>` +
      `<span class="chat-option" onclick="window._cwChat.quickSend('0.5 SOL')">0.5 SOL</span>` +
      `<span class="chat-option" onclick="window._cwChat.quickSend('1 SOL')">1 SOL</span>` +
      `<span class="chat-option" onclick="window._cwChat.quickSend('5 SOL')">5 SOL</span>` +
      `</div>`
    ],
    state
  };
}

function handleBootstrapFlow(msg, original, state, sessionId) {
  if (matchesAny(msg, ['cancel', 'nevermind', 'stop', 'quit', 'exit'])) {
    return { replies: ['No worries! The bootstrap is always open. Come back anytime! 🦞'], state: resetState(sessionId) };
  }

  if (state.step === 'amount') {
    // Parse SOL amount
    const amountMatch = original.match(/([\d.]+)\s*(?:sol)?/i);
    if (!amountMatch) {
      return { replies: ['Please enter a valid amount, e.g., <strong>1 SOL</strong> or just <strong>0.5</strong>'], state };
    }

    const solAmount = parseFloat(amountMatch[1]);
    if (isNaN(solAmount) || solAmount < 0.01) {
      return { replies: ['Minimum contribution is <strong>0.01 SOL</strong>. How much would you like to contribute?'], state };
    }
    if (solAmount > 1000) {
      return { replies: ['Maximum single contribution is <strong>1000 SOL</strong>. How much would you like to contribute?'], state };
    }

    const clwdnAmount = (solAmount * 10000).toLocaleString();
    state.step = 'confirm';
    state.data.solAmount = solAmount;
    state.data.clwdnAmount = clwdnAmount;
    sessions[sessionId] = state;

    return {
      replies: [
        `💎 You'll receive <strong>${clwdnAmount} CLWDN</strong> for <strong>${solAmount} SOL</strong>.<br><br>` +
        `Payment wallet: <code>${PAYMENT_WALLET.slice(0,8)}...</code><br><br>` +
        `Connect your wallet and click Contribute:<br>` +
        `<button class="chat-btn" onclick="window._cwChat.payBootstrap()">🦞 Contribute ${solAmount} SOL</button>` +
        `<button class="chat-btn" onclick="window._cwChat.quickSend('Cancel')" style="background:var(--brd);margin-left:6px">Cancel</button>`
      ],
      state
    };
  }

  return { replies: [defaultMessage()], state: resetState(sessionId) };
}

// --- Message Templates ---

function helpMessage() {
  return `Here's what I can help you with: 🦞<br><br>` +
    `<div class="chat-options">` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Launch a token')">🚀 Launch a Token</span>` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Invest in CLWDN')">💰 Invest in CLWDN</span>` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Tell me about staking')">💎 Staking</span>` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('What is ClawdNation?')">❓ About ClawdNation</span>` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Show me socials')">🌐 Socials</span>` +
    `</div>`;
}

function aboutMessage() {
  return `<strong>ClawdNation</strong> is a Solana token ecosystem 🦞<br><br>` +
    `• <strong>Token Factory</strong> — Launch tokens via Twitter/web for 0.05 SOL<br>` +
    `• <strong>CLWDN Bootstrap</strong> — Get CLWDN at 0.0001 SOL each<br>` +
    `• <strong>Staking</strong> — Earn rewards by staking CLWDN (coming soon)<br>` +
    `• <strong>Tokenomics</strong> — 1B supply, fair distribution, Token-2022<br><br>` +
    `All powered by on-chain Solana programs. No VC, no presale — just community! 🤝<br><br>` +
    `Follow us: <a href="https://x.com/clawdnation" target="_blank">X/Twitter</a> · ` +
    `<a href="https://moltx.io/ClawdNation_bot" target="_blank">MoltX</a> · ` +
    `<a href="https://moltbook.com/u/ClawdNation" target="_blank">Moltbook</a>`;
}

function stakingMessage() {
  return `💎 <strong>CLWDN Staking</strong> is coming soon!<br><br>` +
    `• 150M CLWDN (15% of supply) allocated for staking rewards<br>` +
    `• Planned pools: CLWDN single-stake + CLWDN/SOL LP<br>` +
    `• APY details will be announced once pools launch<br><br>` +
    `Get your CLWDN now during the bootstrap to be ready! ` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Invest in CLWDN')" style="display:inline;margin-left:4px">💰 Get CLWDN</span>`;
}

function airdropMessage() {
  return `🪂 <strong>CLWDN Distribution</strong><br><br>` +
    `The CLWDN bootstrap is the primary way to get tokens:<br>` +
    `• <strong>1 SOL = 10,000 CLWDN</strong> (bootstrap rate)<br>` +
    `• Send SOL → auto-receive CLWDN via dispenser (~10s)<br>` +
    `• No airdrop sign-up needed — just contribute!<br><br>` +
    `Community airdrops may happen for active participants. Stay tuned on our socials! 🦞<br>` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Invest in CLWDN')" style="display:inline">💰 Contribute Now</span>`;
}

function priceMessage() {
  return `📊 <strong>CLWDN Price</strong><br><br>` +
    `• Bootstrap price: <strong>0.0001 SOL/CLWDN</strong><br>` +
    `• Post-bootstrap target: 0.00025 SOL (2.5x)<br>` +
    `• Total supply: 1,000,000,000 CLWDN<br><br>` +
    `The bootstrap is the best time to get in! ` +
    `<span class="chat-option" onclick="window._cwChat.quickSend('Invest in CLWDN')" style="display:inline">💰 Get CLWDN</span>`;
}

function socialMessage() {
  return `🌐 <strong>Follow ClawdNation</strong><br><br>` +
    `• <a href="https://x.com/clawdnation" target="_blank">𝕏 Twitter/X</a> — @clawdnation<br>` +
    `• <a href="https://moltx.io/ClawdNation_bot" target="_blank">🦠 MoltX</a> — @ClawdNation_bot<br>` +
    `• <a href="https://moltbook.com/u/ClawdNation" target="_blank">📰 Moltbook</a> — ClawdNation<br><br>` +
    `Join the community and stay updated! 🦞`;
}

function greetingMessage() {
  const greetings = [
    'Hey there! Welcome to ClawdNation! 🦞',
    'GM! Ready to explore ClawdNation? 🦞',
    'Hello fren! What can I help you with? 🦞',
    'Yo! The lobster is here to help! 🦞',
  ];
  return greetings[Math.floor(Math.random() * greetings.length)] + '<br><br>' + helpMessage();
}

function defaultMessage() {
  return `I'm not sure what you mean, but I'm here to help! 🦞<br><br>` + helpMessage();
}

// --- Helpers ---

function matches(msg, group1, group2) {
  return group1.some(w => msg.includes(w)) || (group2 && group2.some(w => msg.includes(w)) && group1.some(w => msg.includes(w)));
}

function matchesAny(msg, words) {
  return words.some(w => msg.includes(w));
}

function parseTokenInfo(text) {
  let name = null, symbol = null;

  // "called X with symbol Y" or "named X symbol Y"
  const m1 = text.match(/(?:called|named|name)\s+["']?([^"']+?)["']?\s+(?:with\s+)?(?:symbol|ticker)\s+["']?(\w+)["']?/i);
  if (m1) { name = m1[1].trim(); symbol = m1[2].trim(); return { name, symbol }; }

  // "$SYMBOL (Name)" or "Name ($SYMBOL)"
  const m2 = text.match(/\$(\w+)\s*(?:\(|[-–—])\s*(.+?)(?:\)|$)/i);
  if (m2) { symbol = m2[1]; name = m2[2].trim(); return { name, symbol }; }

  const m3 = text.match(/(.+?)\s*(?:\(|[-–—])\s*\$?(\w{2,10})(?:\)|$)/i);
  if (m3 && m3[2].length <= 10) { name = m3[1].trim(); symbol = m3[2]; return { name, symbol }; }

  // "token X symbol Y"
  const m4 = text.match(/token\s+["']?(.+?)["']?\s+(?:symbol|ticker)\s+["']?(\w+)["']?/i);
  if (m4) { name = m4[1].trim(); symbol = m4[2].trim(); return { name, symbol }; }

  return { name, symbol };
}

function resetState(sessionId) {
  const s = { flow: null, step: null, data: {} };
  sessions[sessionId] = s;
  return s;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

module.exports = { handleChat };
