/**
 * ClawdNation Self-Birth Module
 * 
 * Handles the CLWDN self-creation flow:
 * 1. Bot posts genesis tweet
 * 2. Bot detects its own tweet via #clawdnation polling
 * 3. Bot contributes 1 SOL to bootstrap (bonding curve)
 * 4. On-chain automation distributes CLWDN
 * 5. Bot tweets confirmation with on-chain proof
 * 
 * This module integrates with twitter/bot.js as a special handler
 * for self-birth tweets (where author_id === BOT_USER_ID).
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Config ─────────────────────────────────────────────────────────

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const NETWORK = process.env.NETWORK || 'devnet';
const EXPLORER = 'https://explorer.solana.com';
const CLUSTER_PARAM = NETWORK === 'mainnet' ? '' : '?cluster=devnet';

// Program IDs
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');

// PDAs
const [BOOTSTRAP_STATE] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
const [DISPENSER_STATE] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

// Bot's own Twitter user ID
const BOT_USER_ID = '2018267311191306240';

// Self-birth contribution amount
const SELF_BIRTH_SOL = 1.0;

// ─── Helpers ────────────────────────────────────────────────────────

function anchorDisc(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

function txLink(sig) { return `${EXPLORER}/tx/${sig}${CLUSTER_PARAM}`; }
function addrLink(addr) { return `${EXPLORER}/address/${addr}${CLUSTER_PARAM}`; }

// ─── Self-Birth Detection ───────────────────────────────────────────

/**
 * Check if a tweet is a self-birth trigger
 * Returns true if the tweet is from the bot itself and contains self-birth keywords
 */
function isSelfBirthTweet(tweet) {
  if (tweet.author_id !== BOT_USER_ID) return false;
  const text = tweet.text.toLowerCase();
  return text.includes('self-creat') || 
         text.includes('self-birth') || 
         text.includes('genesis') ||
         text.includes('$clwdn') && (text.includes('launch') || text.includes('live') || text.includes('birth'));
}

// ─── Bootstrap Contribution ─────────────────────────────────────────

/**
 * Read bootstrap state to get the 3 wallet addresses
 */
async function getBootstrapWallets() {
  const acct = await conn.getAccountInfo(BOOTSTRAP_STATE);
  if (!acct) throw new Error('Bootstrap state not found');
  const d = acct.data;
  let o = 8 + 32 + 1; // disc + authority + pending_authority option tag
  if (d[8 + 32]) o += 32; // skip pending_authority pubkey if Some
  const lpWallet = new PublicKey(d.slice(o, o + 32)); o += 32;
  const masterWallet = new PublicKey(d.slice(o, o + 32)); o += 32;
  const stakingWallet = new PublicKey(d.slice(o, o + 32)); o += 32;
  return { lpWallet, masterWallet, stakingWallet };
}

/**
 * Contribute SOL to bootstrap program (bonding curve)
 * Returns { sig, clwdnExpected }
 */
async function contributeSol(authority, amountSol) {
  const amountLamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  
  // Get bootstrap wallets from on-chain state
  const { lpWallet, masterWallet, stakingWallet } = await getBootstrapWallets();
  
  // Derive contributor PDA
  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), authority.publicKey.toBuffer()], BOOTSTRAP_PROGRAM
  );

  // Build contribute_sol instruction
  const disc = anchorDisc('contribute_sol');
  const data = Buffer.alloc(8 + 8);
  disc.copy(data, 0);
  data.writeBigUInt64LE(BigInt(amountLamports), 8);

  const ix = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: BOOTSTRAP_STATE, isSigner: false, isWritable: true },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: lpWallet, isSigner: false, isWritable: true },
      { pubkey: masterWallet, isSigner: false, isWritable: true },
      { pubkey: stakingWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);

  // Read contribution record for allocated amount
  const record = await conn.getAccountInfo(contributorPda);
  let clwdnAllocated = 0;
  if (record) {
    clwdnAllocated = Number(record.data.readBigUInt64LE(48)) / 1e9;
  }

  return { sig, contributorPda, clwdnAllocated };
}

/**
 * Wait for dispenser to distribute CLWDN
 * Returns { distributed, balance, timeMs }
 */
async function waitForDistribution(walletPubkey, timeoutMs = 60000) {
  const ata = await getAssociatedTokenAddress(CLWDN_MINT, walletPubkey, false, TOKEN_PROGRAM_ID);
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    try {
      const account = await getAccount(conn, ata, 'confirmed', TOKEN_PROGRAM_ID);
      if (account.amount > 0n) {
        return {
          distributed: true,
          balance: Number(account.amount) / 1e9,
          timeMs: Date.now() - start,
          ata: ata.toBase58(),
        };
      }
    } catch {
      // ATA doesn't exist yet
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  
  return { distributed: false, balance: 0, timeMs: Date.now() - start };
}

// ─── Self-Birth Execution ───────────────────────────────────────────

/**
 * Execute the full self-birth flow
 * Called by twitter/bot.js when it detects its own genesis tweet
 * 
 * @param {Keypair} authority - The deployer keypair
 * @param {Function} tweetFn - Function to post tweets (from bot.js)
 * @param {string} genesisTweetId - The genesis tweet to reply to
 * @returns {Object} Result of the self-birth
 */
async function executeSelfBirth(authority, tweetFn, genesisTweetId) {
  console.log('\n🦞 ═══════════════════════════════════════════');
  console.log('🦞  CLWDN SELF-BIRTH INITIATED');
  console.log('🦞 ═══════════════════════════════════════════\n');

  const result = { success: false, steps: [] };

  try {
    // Step 1: Check balance
    const balance = await conn.getBalance(authority.publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;
    console.log(`💰 Authority balance: ${balanceSol} SOL`);
    
    if (balanceSol < SELF_BIRTH_SOL + 0.01) {
      throw new Error(`Insufficient SOL: have ${balanceSol}, need ${SELF_BIRTH_SOL + 0.01}`);
    }
    result.steps.push({ step: 'balance_check', status: '✅', balance: balanceSol });

    // Step 2: Contribute to bootstrap
    console.log(`\n📤 Contributing ${SELF_BIRTH_SOL} SOL to bootstrap...`);
    const { sig, contributorPda, clwdnAllocated } = await contributeSol(authority, SELF_BIRTH_SOL);
    console.log(`✅ Contribution TX: ${sig}`);
    console.log(`   Allocated: ${clwdnAllocated} CLWDN`);
    console.log(`   Explorer: ${txLink(sig)}`);
    result.steps.push({ step: 'contribute', status: '✅', sig, clwdnAllocated });

    // Tweet progress
    if (tweetFn) {
      await tweetFn(
        `⚡ Genesis contribution: ${SELF_BIRTH_SOL} SOL → ${clwdnAllocated.toLocaleString()} $CLWDN allocated\n\nBonding curve rate: 10,000 CLWDN/SOL\nOn-chain proof: ${txLink(sig)}\n\n⏳ Waiting for on-chain distribution...`,
        genesisTweetId
      );
    }

    // Step 3: Wait for distribution
    console.log('\n⏳ Waiting for on-chain distribution...');
    const dist = await waitForDistribution(authority.publicKey, 90000);
    
    if (dist.distributed) {
      console.log(`✅ CLWDN received! Balance: ${dist.balance} CLWDN (${dist.timeMs / 1000}s)`);
      result.steps.push({ step: 'distribution', status: '✅', balance: dist.balance, timeMs: dist.timeMs });
      result.success = true;

      // Tweet success
      if (tweetFn) {
        await tweetFn(
          `🦞 $CLWDN SELF-BIRTH COMPLETE!\n\n✅ ${dist.balance.toLocaleString()} CLWDN distributed\n✅ Fully on-chain automated\n✅ Bonding curve active\n\nToken: ${addrLink(CLWDN_MINT.toBase58())}\nBootstrap: ${addrLink(BOOTSTRAP_PROGRAM.toBase58())}\n\nSend SOL → get CLWDN. Early contributors get the best rate.\n\nclawdnation.com`,
          genesisTweetId
        );
      }
    } else {
      console.log('❌ Distribution timed out');
      result.steps.push({ step: 'distribution', status: '❌', timeMs: dist.timeMs });
      
      if (tweetFn) {
        await tweetFn(
          `⚠️ Contribution recorded on-chain but distribution pending.\n\nThe on-chain automation will complete shortly.\nMonitor: ${addrLink(contributorPda.toBase58())}`,
          genesisTweetId
        );
      }
    }

  } catch (e) {
    console.error('❌ Self-birth error:', e.message);
    result.error = e.message;
    result.steps.push({ step: 'error', status: '❌', error: e.message });
  }

  console.log('\n🦞 Self-birth result:', JSON.stringify(result, null, 2));
  return result;
}

// ─── Genesis Tweet Templates ────────────────────────────────────────

const GENESIS_TWEET = `🦞 $CLWDN self-creating on Solana ${NETWORK}.

This post is the genesis. The on-chain system processes this tweet, contributes to the bonding curve, and distributes tokens — all automated.

No presale. No insiders. Early contributors get the best rate.

clawdnation.com #clawdnation`;

module.exports = {
  BOT_USER_ID,
  isSelfBirthTweet,
  executeSelfBirth,
  contributeSol,
  waitForDistribution,
  getBootstrapWallets,
  GENESIS_TWEET,
  SELF_BIRTH_SOL,
};
