/**
 * Payment Monitor — watches for SOL payments and triggers token creation
 * 
 * Stores pending orders in orders.json
 * Polls for incoming SOL transfers to our wallet
 * When payment confirmed → creates token → notifies via callback
 * 
 * Fix: Tracks seen tx signatures to prevent double-processing.
 * Fix: Matches payments by sender address to the order's recipientWallet.
 * Fix: Ignores self-transfers (sender === our payment address).
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const { createToken } = require('./token-factory');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const NETWORK = process.env.NETWORK || 'devnet';
const ORDERS_PATH = path.join(__dirname, NETWORK === 'mainnet' ? 'orders-mainnet.json' : 'orders.json');
const SEEN_TX_PATH = path.join(__dirname, 'seen-txs.json');
const MIN_PAYMENT_SOL = parseFloat(process.env.MIN_PAYMENT_SOL || '0.05');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '10000');
const OUR_ADDRESS = process.env.PAYMENT_ADDRESS || 'GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE';

const connection = new Connection(RPC, 'confirmed');

function loadOrders() {
  if (!fs.existsSync(ORDERS_PATH)) return [];
  return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));
}

function loadSeenTxs() {
  if (!fs.existsSync(SEEN_TX_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SEEN_TX_PATH, 'utf8')); } catch { return {}; }
}

function saveSeenTxs(seen) {
  fs.writeFileSync(SEEN_TX_PATH, JSON.stringify(seen, null, 2));
}

/**
 * Create a new order (pending payment)
 */
function createOrder({ tweetId, tweetAuthor, name, symbol, description, image, recipientWallet }) {
  const orders = loadOrders();
  
  if (orders.find(o => o.tweetId === tweetId)) {
    console.log(`Order already exists for tweet ${tweetId}`);
    return orders.find(o => o.tweetId === tweetId);
  }

  const order = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tweetId,
    tweetAuthor,
    name,
    symbol,
    description,
    image,
    recipientWallet,
    status: 'pending_payment',
    paymentAddress: OUR_ADDRESS,
    requiredSol: MIN_PAYMENT_SOL,
    createdAt: new Date().toISOString(),
    paymentTx: null,
    tokenMint: null,
  };

  orders.push(order);
  saveOrders(orders);
  console.log(`📝 Order created: ${order.id} for $${symbol} by ${tweetAuthor}`);
  return order;
}

/**
 * Check for payments to our address
 */
async function checkPayments() {
  const orders = loadOrders();
  const pending = orders.filter(o => o.status === 'pending_payment');
  if (!pending.length) return;

  const address = new PublicKey(OUR_ADDRESS);
  const seen = loadSeenTxs();

  try {
    const sigs = await connection.getSignaturesForAddress(address, { limit: 20 });
    let changed = false;
    
    for (const sig of sigs) {
      // Skip already-processed transactions
      if (seen[sig.signature]) continue;

      const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.meta) continue;

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
          const dest = ix.parsed.info.destination;
          const lamports = ix.parsed.info.lamports;
          const sol = lamports / LAMPORTS_PER_SOL;
          const sender = ix.parsed.info.source;

          // Skip self-transfers
          if (sender === OUR_ADDRESS) {
            seen[sig.signature] = { skipped: 'self-transfer', at: new Date().toISOString() };
            changed = true;
            continue;
          }

          if (dest === OUR_ADDRESS && sol >= MIN_PAYMENT_SOL) {
            // Match by sender wallet OR by amount if sender is unknown
            // Priority: exact sender match to recipientWallet
            let order = pending.find(o => 
              o.status === 'pending_payment' && 
              !o.paymentTx &&
              o.recipientWallet === sender
            );

            // Fallback: match any pending order (first-come first-served)
            if (!order) {
              order = pending.find(o => 
                o.status === 'pending_payment' && 
                !o.paymentTx
              );
            }

            if (order) {
              console.log(`💰 Payment received: ${sol} SOL from ${sender} (tx: ${sig.signature})`);
              order.status = 'payment_confirmed';
              order.paymentTx = sig.signature;
              order.paymentAmount = sol;
              order.paymentSender = sender;
              order.paidAt = new Date().toISOString();
              saveOrders(orders);

              seen[sig.signature] = { orderId: order.id, at: new Date().toISOString() };
              changed = true;

              // Trigger token creation
              await processOrder(order);
            } else {
              // No matching order, mark as seen anyway
              seen[sig.signature] = { skipped: 'no-matching-order', sol, sender, at: new Date().toISOString() };
              changed = true;
            }
          }
        }
      }

      // Mark tx as seen even if no transfer found
      if (!seen[sig.signature]) {
        seen[sig.signature] = { skipped: 'no-transfer', at: new Date().toISOString() };
        changed = true;
      }
    }

    if (changed) saveSeenTxs(seen);
  } catch (e) {
    console.error('Payment check error:', e.message);
  }
}

/**
 * Process a paid order — create the token
 */
async function processOrder(order) {
  const orders = loadOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  
  try {
    console.log(`🏭 Processing order ${order.id}: creating $${order.symbol}...`);
    orders[idx].status = 'creating_token';
    saveOrders(orders);

    const result = await createToken({
      name: order.name,
      symbol: order.symbol,
      description: order.description,
      image: order.image,
      recipient: order.recipientWallet,
    });

    orders[idx].status = 'completed';
    orders[idx].tokenMint = result.mint;
    orders[idx].tokenExplorer = result.explorer;
    orders[idx].completedAt = new Date().toISOString();
    saveOrders(orders);

    console.log(`✅ Order ${order.id} completed! Token: ${result.mint}`);
    return result;
  } catch (e) {
    console.error(`❌ Order ${order.id} failed:`, e.message);
    const orders2 = loadOrders();
    const idx2 = orders2.findIndex(o => o.id === order.id);
    if (idx2 >= 0) {
      orders2[idx2].status = 'failed';
      orders2[idx2].error = e.message;
      saveOrders(orders2);
    }
  }
}

/**
 * Start polling for payments
 */
function startMonitor() {
  console.log('🔍 Payment monitor started');
  console.log(`   Address: ${OUR_ADDRESS}`);
  console.log(`   Min payment: ${MIN_PAYMENT_SOL} SOL`);
  console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
  
  setInterval(checkPayments, POLL_INTERVAL);
  checkPayments();
}

if (require.main === module) {
  startMonitor();
}

module.exports = { createOrder, checkPayments, processOrder, loadOrders };
