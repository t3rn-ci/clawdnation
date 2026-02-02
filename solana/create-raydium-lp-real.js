#!/usr/bin/env node
/**
 * REAL RAYDIUM LP CREATION
 *
 * Creates actual Raydium CPMM pool on-chain and burns LP tokens
 * Usage:
 *   node create-raydium-lp-real.js              # devnet
 *   node create-raydium-lp-real.js --mainnet    # mainnet (PRODUCTION)
 *
 * ⚠️  MAINNET WARNING: This deploys REAL liquidity with REAL funds!
 */

const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, burn, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Raydium, TxVersion, parseTokenAccountResp } = require('@raydium-io/raydium-sdk-v2');
const fs = require('fs');
const path = require('path');

// Parse command-line args
const args = process.argv.slice(2);
const isMainnet = args.includes('--mainnet');
const isDryRun = args.includes('--dry-run');

// Network configuration
const NETWORK = isMainnet ? 'mainnet-beta' : 'devnet';
const RPC = isMainnet
  ? (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
  : (process.env.DEVNET_RPC || 'https://api.devnet.solana.com');

const conn = new Connection(RPC, 'confirmed');

// Network-specific addresses
const ADDRESSES = {
  devnet: {
    clwdnMint: '2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3',
    lpWallet: '2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V',
    cpmmProgram: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  },
  mainnet: {
    clwdnMint: process.env.MAINNET_CLWDN_MINT || '',
    lpWallet: process.env.MAINNET_LP_WALLET || '',
    cpmmProgram: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  }
};

const config = ADDRESSES[isMainnet ? 'mainnet' : 'devnet'];

// Validate mainnet addresses
if (isMainnet && (!config.clwdnMint || !config.lpWallet)) {
  console.error('❌ Mainnet addresses not configured!');
  console.error('   Please set environment variables:');
  console.error('   - MAINNET_CLWDN_MINT');
  console.error('   - MAINNET_LP_WALLET');
  process.exit(1);
}

const CLWDN_MINT = new PublicKey(config.clwdnMint);
const LP_WALLET = new PublicKey(config.lpWallet);
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Load authority keypair
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
if (!fs.existsSync(authorityPath)) {
  console.error('❌ Keypair not found at:', authorityPath);
  process.exit(1);
}
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         REAL RAYDIUM LP CREATION                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (isMainnet) {
    console.log('🚨 MAINNET MODE - THIS WILL USE REAL FUNDS! 🚨\n');
    if (!isDryRun) {
      console.log('⚠️  You have 10 seconds to cancel (Ctrl+C)...\n');
      await new Promise(r => setTimeout(r, 10000));
    }
  } else {
    console.log('🧪 DEVNET MODE - Testing with devnet tokens\n');
  }

  console.log('📋 CONFIGURATION:\n');
  console.log('  Network:', NETWORK);
  console.log('  RPC:', RPC);
  console.log('  Authority:', authority.publicKey.toBase58());
  console.log('  LP Wallet:', LP_WALLET.toBase58());
  console.log('  CLWDN Mint:', CLWDN_MINT.toBase58());
  console.log('  Dry Run:', isDryRun ? 'YES (no transactions)' : 'NO (real transactions)');
  console.log('');
  console.log('━━━ STEP 1: Check LP Wallet Funds ━━━\n');

  const lpBalance = await conn.getBalance(LP_WALLET);
  const lpSOL = lpBalance / LAMPORTS_PER_SOL;

  console.log('  LP Wallet SOL:', lpSOL.toFixed(4), 'SOL');

  if (lpSOL < 0.1) {
    console.log('\n❌ Insufficient SOL (need at least 0.1 SOL)\n');
    return;
  }

  // Get CLWDN balance in LP wallet
  const lpClwdnAta = await getAssociatedTokenAddress(CLWDN_MINT, LP_WALLET, true);
  let lpClwdnBalance = 0;

  try {
    const clwdnAcct = await getAccount(conn, lpClwdnAta);
    lpClwdnBalance = Number(clwdnAcct.amount) / 1e9;
    console.log('  LP Wallet CLWDN:', lpClwdnBalance.toLocaleString(), 'CLWDN');
  } catch (e) {
    console.log('  LP Wallet CLWDN: No token account yet');
  }

  if (lpClwdnBalance < 1000) {
    console.log('\n❌ Insufficient CLWDN (need at least 1000 CLWDN for test)\n');
    return;
  }

  // Calculate pool amounts
  const finalBootstrapRate = 40_000; // CLWDN per SOL
  const poolSOL = lpSOL * 0.95; // Keep 5% for fees
  const poolCLWDN = Math.floor(poolSOL * finalBootstrapRate);

  console.log('\n  Pool Composition:');
  console.log('    SOL:', poolSOL.toFixed(4), 'SOL');
  console.log('    CLWDN:', poolCLWDN.toLocaleString(), 'CLWDN');
  console.log('    Initial Rate:', finalBootstrapRate.toLocaleString(), 'CLWDN/SOL');
  console.log('');

  if (isDryRun) {
    console.log('✅ DRY RUN - Would create pool with these parameters\n');
    return;
  }

  console.log('━━━ STEP 2: Initialize Raydium SDK ━━━\n');

  const raydium = await Raydium.load({
    connection: conn,
    owner: authority,
    cluster: isMainnet ? 'mainnet' : 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
  });

  console.log('  Raydium SDK loaded ✅');
  console.log('  Cluster:', raydium.cluster);
  console.log('');

  console.log('━━━ STEP 3: Create CPMM Pool ━━━\n');

  try {
    // Create pool using Raydium SDK v2
    console.log('  Creating pool on-chain...');

    const { execute, extInfo } = await raydium.cpmm.createPool({
      programId: new PublicKey(config.cpmmProgram),
      poolFeeAccount: new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'), // Raydium fee account
      mintA: SOL_MINT,
      mintB: CLWDN_MINT,
      mintAAmount: BigInt(Math.floor(poolSOL * LAMPORTS_PER_SOL)),
      mintBAmount: BigInt(Math.floor(poolCLWDN * 1e9)),
      startTime: new BN(Math.floor(Date.now() / 1000)), // Start immediately
      txVersion: TxVersion.V0,
    });

    // Execute transaction
    const { txId, signedTx } = await execute({ sendAndConfirm: true });

    console.log('  ✅ Pool created!');
    console.log('  Transaction:', txId);
    console.log('  Explorer:', `https://explorer.solana.com/tx/${txId}?cluster=${NETWORK}`);
    console.log('');

    const poolId = extInfo.address.poolId.toBase58();
    const lpMint = extInfo.address.lpMint.toBase58();

    console.log('  Pool ID:', poolId);
    console.log('  LP Mint:', lpMint);
    console.log('  Explorer:', `https://explorer.solana.com/address/${poolId}?cluster=${NETWORK}`);
    console.log('');

    // Wait for confirmation
    console.log('  Waiting for confirmation...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('━━━ STEP 4: Burn LP Tokens ━━━\n');

    const lpTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(lpMint),
      authority.publicKey
    );

    console.log('  LP Token Account:', lpTokenAccount.toBase58());

    // Get LP token balance
    const lpAcct = await getAccount(conn, lpTokenAccount);
    const lpAmount = lpAcct.amount;

    console.log('  LP Balance:', Number(lpAmount).toLocaleString(), 'LP tokens');
    console.log('');
    console.log('  🔥 Burning ALL LP tokens...');

    // Burn all LP tokens
    const burnSig = await burn(
      conn,
      authority,
      lpTokenAccount,
      new PublicKey(lpMint),
      authority,
      lpAmount
    );

    console.log('  ✅ LP tokens burned!');
    console.log('  Transaction:', burnSig);
    console.log('  Explorer:', `https://explorer.solana.com/tx/${burnSig}?cluster=${NETWORK}`);
    console.log('');

    // Verify burn
    await new Promise(r => setTimeout(r, 3000));
    const lpAcctAfter = await getAccount(conn, lpTokenAccount);
    console.log('  Verification:');
    console.log('    LP Balance After Burn:', Number(lpAcctAfter.amount));
    console.log('    Status:', Number(lpAcctAfter.amount) === 0 ? '✅ LOCKED' : '❌ NOT FULLY BURNED');
    console.log('');

    console.log('━━━ STEP 5: Verification ━━━\n');

    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(new PublicKey(poolId));

    console.log('  Pool Status:');
    console.log('    SOL Reserve:', Number(poolInfo.mintAmountA) / LAMPORTS_PER_SOL, 'SOL');
    console.log('    CLWDN Reserve:', Number(poolInfo.mintAmountB) / 1e9, 'CLWDN');
    console.log('    LP Supply:', Number(poolInfo.lpAmount));
    console.log('    Trading Active:', poolInfo.startTime > 0 ? 'YES' : 'NO');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SUCCESS - LP CREATED AND LOCKED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('  Pool ID:', poolId);
    console.log('  LP Mint:', lpMint);
    console.log('  Creation TX:', txId);
    console.log('  Burn TX:', burnSig);
    console.log('');
    console.log('  🔒 Pool is permanently locked (all LP tokens burned)');
    console.log('  🚀 Trading is now live on Raydium!');
    console.log('');

    // Save results
    const results = {
      network: NETWORK,
      timestamp: new Date().toISOString(),
      poolId,
      lpMint,
      txs: {
        creation: txId,
        burn: burnSig,
      },
      reserves: {
        sol: Number(poolInfo.mintAmountA) / LAMPORTS_PER_SOL,
        clwdn: Number(poolInfo.mintAmountB) / 1e9,
      },
      lpBurned: Number(lpAcctAfter.amount) === 0,
    };

    fs.writeFileSync(
      path.join(__dirname, `lp-creation-${NETWORK}-${Date.now()}.json`),
      JSON.stringify(results, null, 2)
    );

    console.log('  Results saved to:', `lp-creation-${NETWORK}-${Date.now()}.json`);
    console.log('');

  } catch (e) {
    console.error('\n❌ Pool creation failed:', e.message);
    if (e.logs) {
      console.error('\nProgram Logs:');
      e.logs.forEach(log => console.error('  ', log));
    }
    throw e;
  }
}

main()
  .then(() => {
    console.log('✅ Complete\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
