/**
 * ClawdNation Chat Widget
 * Rule-based chatbot for token creation, bootstrap investment, and guidance
 */
(function() {
  'use strict';

  const SESSION_KEY = 'clawdnation_chat_session';
  const HISTORY_KEY = 'clawdnation_chat_history';

  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'chat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  // State
  let chatOpen = false;
  let chatState = { flow: null, step: null, data: {} };

  // Load history from localStorage
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  }
  function saveHistory(msgs) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-100))); } catch {}
  }

  // Create DOM
  function createWidget() {
    // Bubble
    const bubble = document.createElement('button');
    bubble.className = 'chat-bubble';
    bubble.innerHTML = '🦞';
    bubble.title = 'Chat with ClawdNation';
    bubble.onclick = toggleChat;
    document.body.appendChild(bubble);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.id = 'chatPanel';
    panel.innerHTML = `
      <div class="chat-header">
        <img src="/logo.jpg" alt="ClawdNation">
        <div class="chat-header-info">
          <div class="chat-header-name">🦞 ClawdNation Bot</div>
          <div class="chat-header-status">Online</div>
        </div>
        <button class="chat-close" onclick="window._cwChat.toggle()">✕</button>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-input-area">
        <input class="chat-input" id="chatInput" placeholder="Ask about tokens, investing, staking..." autocomplete="off">
        <button class="chat-send" id="chatSend" onclick="window._cwChat.send()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    // Input enter key
    document.getElementById('chatInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._cwChat.send(); }
    });

    // Load history
    const msgs = loadHistory();
    if (msgs.length > 0) {
      msgs.forEach(m => appendMessage(m.role, m.html, false));
    } else {
      // Welcome message
      showWelcome();
    }
  }

  function showWelcome() {
    const cfg = window.CLWDN_CONFIG || {};
    const netLabel = cfg.network === 'mainnet' ? 'Mainnet' : 'Devnet';
    const html = `Welcome to <strong>ClawdNation</strong>! 🦞<br><br>I can help you with:
      <div class="chat-options">
        <span class="chat-option" onclick="window._cwChat.quickSend('Launch a token')">🚀 Launch a Token</span>
        <span class="chat-option" onclick="window._cwChat.quickSend('Invest in CLWDN')">💰 Invest in CLWDN</span>
        <span class="chat-option" onclick="window._cwChat.quickSend('Tell me about staking')">💎 Staking</span>
        <span class="chat-option" onclick="window._cwChat.quickSend('What is ClawdNation?')">❓ About</span>
      </div>`;
    appendMessage('bot', html);
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    document.querySelector('.chat-bubble').classList.toggle('open', chatOpen);
    document.getElementById('chatPanel').classList.toggle('open', chatOpen);
    if (chatOpen) {
      setTimeout(() => document.getElementById('chatInput').focus(), 300);
      scrollToBottom();
    }
  }

  function appendMessage(role, html, save = true) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.innerHTML = html;
    container.appendChild(div);
    scrollToBottom();
    if (save) {
      const history = loadHistory();
      history.push({ role, html, ts: Date.now() });
      saveHistory(history);
    }
  }

  function showTyping() {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.id = 'chatTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById('chatTyping');
    if (el) el.remove();
  }

  function scrollToBottom() {
    const c = document.getElementById('chatMessages');
    if (c) setTimeout(() => c.scrollTop = c.scrollHeight, 50);
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    appendMessage('user', escapeHtml(text));
    document.getElementById('chatInput').value = '';

    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, state: chatState })
      });
      const data = await res.json();
      hideTyping();

      if (data.state) chatState = data.state;

      if (data.replies) {
        for (const reply of data.replies) {
          appendMessage('bot', reply);
          await sleep(300);
        }
      } else if (data.reply) {
        appendMessage('bot', data.reply);
      }
    } catch (e) {
      hideTyping();
      appendMessage('bot', '⚠️ Something went wrong. Please try again.');
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Expose API
  window._cwChat = {
    toggle: toggleChat,
    send: function() { sendMessage(document.getElementById('chatInput').value); },
    quickSend: function(text) { sendMessage(text); },
    payToken: payForToken,
    payBootstrap: payForBootstrap,
  };

  // Wallet payment for token creation
  async function payForToken() {
    if (!chatState.data || !chatState.data.orderId) return;
    const cfg = window.CLWDN_CONFIG || {};
    const wallet = cfg.paymentWallet || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
    const amount = 0.05;

    try {
      if (!window.solanaWallet || !window.solanaWallet.publicKey) {
        appendMessage('bot', '⚠️ Please connect your wallet first using the button in the nav bar, then try again.');
        return;
      }

      appendMessage('bot', '⏳ Preparing transaction...');
      const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
      if (!Connection) {
        appendMessage('bot', '⚠️ Solana web3 not loaded. Please refresh the page.');
        return;
      }

      const connection = new Connection(cfg.rpc || 'https://api.devnet.solana.com');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: window.solanaWallet.publicKey,
          toPubkey: new PublicKey(wallet),
          lamports: Math.round(amount * LAMPORTS_PER_SOL),
        })
      );
      tx.feePayer = window.solanaWallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const signed = await window.solanaWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      appendMessage('bot', '✅ Payment sent! Tx: <code>' + sig.slice(0,12) + '...</code><br>Waiting for confirmation and token creation...');

      // Poll for completion
      pollOrderStatus(chatState.data.orderId, sig);
    } catch (e) {
      appendMessage('bot', '❌ Payment failed: ' + escapeHtml(e.message || 'User rejected'));
    }
  }

  // Wallet payment for bootstrap
  async function payForBootstrap() {
    if (!chatState.data || !chatState.data.solAmount) return;
    const cfg = window.CLWDN_CONFIG || {};
    const wallet = cfg.paymentWallet || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';
    const amount = chatState.data.solAmount;

    try {
      if (!window.solanaWallet || !window.solanaWallet.publicKey) {
        appendMessage('bot', '⚠️ Please connect your wallet first using the button in the nav bar, then try again.');
        return;
      }

      appendMessage('bot', '⏳ Preparing bootstrap contribution...');
      const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
      if (!Connection) {
        appendMessage('bot', '⚠️ Solana web3 not loaded. Please refresh the page.');
        return;
      }

      const connection = new Connection(cfg.rpc || 'https://api.devnet.solana.com');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: window.solanaWallet.publicKey,
          toPubkey: new PublicKey(wallet),
          lamports: Math.round(amount * LAMPORTS_PER_SOL),
        })
      );
      tx.feePayer = window.solanaWallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const signed = await window.solanaWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      const clwdnAmount = (amount * 10000).toLocaleString();
      appendMessage('bot', '✅ Contribution sent! Tx: <code>' + sig.slice(0,12) + '...</code><br><br>The dispenser will distribute your <strong>' + clwdnAmount + ' CLWDN</strong> shortly (~10-30 seconds). 🦞');

      chatState = { flow: null, step: null, data: {} };
    } catch (e) {
      appendMessage('bot', '❌ Transaction failed: ' + escapeHtml(e.message || 'User rejected'));
    }
  }

  async function pollOrderStatus(orderId, txSig) {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        appendMessage('bot', '⏰ Token creation is taking longer than expected. Check the Tokens tab for updates.');
        return;
      }
      try {
        const res = await fetch('/api/orders');
        const data = await res.json();
        const order = (data.orders || []).find(o => o.id === orderId);
        if (order && order.status === 'completed' && order.tokenMint) {
          clearInterval(interval);
          const cfg = window.CLWDN_CONFIG || {};
          const explorer = (cfg.explorer || 'https://explorer.solana.com') + '/address/' + order.tokenMint + (cfg.cluster || '');
          appendMessage('bot', '🎉 <strong>$' + escapeHtml(order.symbol) + '</strong> is live!<br><br>Mint: <code>' + order.tokenMint.slice(0,8) + '...</code><br><a href="' + explorer + '" target="_blank">View on Explorer →</a>');
          chatState = { flow: null, step: null, data: {} };
        }
      } catch {}
    }, 5000);
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
