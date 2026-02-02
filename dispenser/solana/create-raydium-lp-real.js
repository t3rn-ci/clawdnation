#!/usr/bin/env node
/**
 * Create Raydium CPMM LP Pool (REAL On-Chain Creation)
 *
 * This script creates an ACTUAL Raydium liquidity pool on-chain using the Raydium SDK v2.
 * It is NOT a simulation - it executes real transactions that create a tradeable pool.
 *
 * Usage:
 *   node create-raydium-lp-real.js [--mainnet] [--dry-run]
 *
 * Features:
 * - Real on-chain pool creation via Raydium CPMM
 * - Automatic LP token burning
 * - Network support (devnet/mainnet)
 * - Dry-run mode for validation
 * - 10-second mainnet confirmation delay
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, burn, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Raydium, TxVersion, DEVNET_PROGRAM_ID, MAINNET_PROGRAM_ID } = require('@raydium-io/raydium-sdk-v2');
const BN = require('bn.js');
const fs = require('fs');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const isMainnet = args.includes('--mainnet');
const isDryRun = args.includes('--dry-run');

// Network configuration
const NETWORK = isMainnet ? 'mainnet-beta' : 'devnet';
const RPC_URL = isMainnet
  ? (process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
  : (process.env.DEVNET_RPC || 'https://api.devnet.solana.com');

// Network-specific addresses
const ADDRESSES = {
  devnet: {
    tokenMint: process.env.DEVNET_TOKEN_MINT || '68Co4J8frthSnaBFhLAfCHTCemoZyZLjSU9gBbktaGNF',
    lpWallet: process.env.DEVNET_LP_WALLET || '2CQZW7NfvJF7V6kLW36CvWYX4SpRNVQEqS91wRXQRR4V',
  },
  mainnet: {
    tokenMint: process.env.MAINNET_TOKEN_MINT || '',
    lpWallet: process.env.MAINNET_LP_WALLET || '',
  }
};

const config = isMainnet ? ADDRESSES.mainnet : ADDRESSES.devnet;

// Validate mainnet configuration
if (isMainnet && (!config.tokenMint || !config.lpWallet)) {
  console.error('❌ Mainnet addresses not configured!');
  console.error('   Please set environment variables:');
  console.error('   - MAINNET_TOKEN_MINT');
  console.error('   - MAINNET_LP_WALLET');
  process.exit(1);
}

// Program IDs
const PROGRAM_IDS = isMainnet ? MAINNET_PROGRAM_ID : DEVNET_PROGRAM_ID;

console.log('🚀 Raydium CPMM LP Creator (REAL On-Chain)\n');
console.log(`Network: ${NETWORK.toUpperCase()}`);
console.log(`RPC: ${RPC_URL}`);
console.log(`Token Mint: ${config.tokenMint}`);
console.log(`LP Wallet: ${config.lpWallet}`);
console.log(`Mode: ${isDryRun ? 'DRY-RUN (validation only)' : 'LIVE EXECUTION'}\n`);

async function main() {
  // Mainnet safety warning
  if (isMainnet && !isDryRun) {
    console.log('🚨 MAINNET MODE - THIS WILL CREATE A REAL POOL! 🚨\n');
    console.log('⚠️  You have 10 seconds to cancel (Ctrl+C)...\n');
    await new Promise(r => setTimeout(r, 10000));
  }

  // Initialize connection
  const conn = new Connection(RPC_URL, 'confirmed');

  // Load authority keypair
  const authorityPath = path.join(process.env.HOME, '.config', 'solana', 'id.json');
  const authorityKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(authorityPath, 'utf-8')))
  );
  const authority = authorityKeypair.publicKey;

  console.log('👤 Authority:', authority.toBase58());
  console.log('💰 Checking balances...\n');

  // Get token mint and check balances
  const tokenMint = new PublicKey(config.tokenMint);
  const lpWallet = new PublicKey(config.lpWallet);

  // Check SOL balance
  const solBalance = await conn.getBalance(lpWallet);
  const solAmount = solBalance / 1e9;
  console.log(`   SOL: ${solAmount.toFixed(4)} SOL`);

  if (solAmount < 0.1) {
    console.error(`\n❌ Insufficient SOL balance (need at least 0.1 SOL for pool creation)`);
    process.exit(1);
  }

  // Check token balance
  const lpTokenAccount = await getAssociatedTokenAddress(tokenMint, lpWallet);
  let tokenBalance = 0;
  try {
    const tokenAccount = await getAccount(conn, lpTokenAccount);
    tokenBalance = Number(tokenAccount.amount);
    console.log(`   Tokens: ${(tokenBalance / 1e9).toLocaleString()} tokens\n`);
  } catch (err) {
    console.error(`\n❌ LP wallet token account not found`);
    process.exit(1);
  }

  if (tokenBalance < 1e9) {
    console.error(`\n❌ Insufficient token balance (need at least 1B tokens for pool creation)`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log('✅ DRY-RUN: All validations passed\n');
    console.log('📊 Pool Configuration:');
    console.log(`   Token A (SOL): ${solAmount.toFixed(4)} SOL`);
    console.log(`   Token B (${config.tokenMint.slice(0, 8)}...): ${(tokenBalance / 1e9).toLocaleString()} tokens`);
    console.log(`   Initial Price: ~${((tokenBalance / 1e9) / solAmount).toLocaleString()} tokens/SOL`);
    console.log(`   Fee Rate: 0.30% (30 basis points)\n`);
    console.log('🚫 Skipping actual pool creation (dry-run mode)');
    return;
  }

  console.log('🔄 Initializing Raydium SDK...\n');

  // Initialize Raydium SDK
  const raydium = await Raydium.load({
    connection: conn,
    owner: authorityKeypair,
    cluster: isMainnet ? 'mainnet' : 'devnet',
    disableFeatureCheck: true,
    blockhashCommitment: 'confirmed',
  });

  console.log('✅ Raydium SDK initialized\n');

  // Get token info
  console.log('📦 Loading token information...\n');

  const wsolMint = await raydium.token.getTokenInfo('So11111111111111111111111111111111111111112'); // Wrapped SOL
  const customToken = await raydium.token.getTokenInfo(config.tokenMint);

  console.log(`   Token A (WSOL): ${wsolMint.symbol}`);
  console.log(`   Token B: ${customToken.symbol || 'Custom Token'}\n`);

  // Get fee configs
  console.log('⚙️  Fetching CPMM fee configurations...\n');
  let feeConfigs = await raydium.api.getCpmmConfigs();

  // For devnet, we need to derive the config PDA
  if (!isMainnet) {
    const { getCpmmPdaAmmConfigId } = require('@raydium-io/raydium-sdk-v2');
    feeConfigs.forEach((config) => {
      config.id = getCpmmPdaAmmConfigId(
        PROGRAM_IDS.CREATE_CPMM_POOL_PROGRAM,
        config.index
      ).publicKey.toBase58();
    });
  }

  console.log(`   Available fee tiers: ${feeConfigs.length}`);
  console.log(`   Using fee config: ${feeConfigs[0].tradeFeeRate / 10000}% (${feeConfigs[0].tradeFeeRate} bps)\n`);

  // Calculate pool amounts (ensure integer arithmetic for BN)
  const solLamports = Math.floor(solAmount * 1e9);
  const solForPoolNum = Math.floor(solLamports * 0.9);
  const solForPool = new BN(solForPoolNum.toString()); // Use 90% of SOL, keep 10% for fees

  const tokensForPoolNum = Math.floor(tokenBalance * 0.9);
  const tokensForPool = new BN(tokensForPoolNum.toString()); // Use 90% of tokens

  console.log('💧 Creating Raydium CPMM Pool...\n');
  console.log(`   SOL Amount: ${(Number(solForPool) / 1e9).toFixed(4)} SOL`);
  console.log(`   Token Amount: ${(Number(tokensForPool) / 1e9).toLocaleString()} tokens`);
  console.log(`   Initial Price: ~${((Number(tokensForPool) / 1e9) / (Number(solForPool) / 1e9)).toLocaleString()} tokens/SOL\n`);

  try {
    // Create pool
    const { execute, extInfo, transactions } = await raydium.cpmm.createPool({
      programId: PROGRAM_IDS.CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount: PROGRAM_IDS.CREATE_CPMM_POOL_FEE_ACC,
      mintA: wsolMint,
      mintB: customToken,
      mintAAmount: solForPool,
      mintBAmount: tokensForPool,
      startTime: new BN(Math.floor(Date.now() / 1000)), // Start immediately
      feeConfig: feeConfigs[0],
      associatedOnly: false,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 100000,
      },
    });

    console.log('📝 Pool creation transaction prepared\n');
    const poolId = extInfo.address?.poolId;
    const lpMint = extInfo.address?.lpMint;
    console.log(`   Pool ID: ${poolId}`);
    console.log(`   LP Mint: ${lpMint}\n`);

    // Execute transaction
    console.log('⚡ Broadcasting transaction to network...\n');

    const { txId } = await execute({ sendAndConfirm: true });

    console.log('✅ Pool created successfully!\n');
    console.log(`   Transaction: ${txId}`);
    console.log(`   Pool ID: ${poolId}`);
    console.log(`   LP Mint: ${lpMint}\n`);

    // Burn LP tokens
    console.log('🔥 Burning LP tokens to permanently lock pool...\n');

    const lpMintPubkey = new PublicKey(lpMint);
    const lpTokenAccount = await getAssociatedTokenAddress(lpMintPubkey, authority);

    // Wait for LP tokens to be minted
    await new Promise(r => setTimeout(r, 5000));

    // Get LP token balance
    const lpAccount = await getAccount(conn, lpTokenAccount);
    const lpAmount = lpAccount.amount;

    console.log(`   LP Tokens to burn: ${Number(lpAmount)}\n`);

    if (lpAmount > 0) {
      const burnSig = await burn(
        conn,
        authorityKeypair,
        lpTokenAccount,
        lpMintPubkey,
        authorityKeypair,
        lpAmount
      );

      console.log('✅ LP tokens burned!\n');
      console.log(`   Transaction: ${burnSig}\n`);

      // Verify burn
      console.log('🔍 Verifying LP burn...\n');

      await new Promise(r => setTimeout(r, 3000));

      const mintInfo = await conn.getParsedAccountInfo(lpMintPubkey);
      const supply = mintInfo.value?.data?.parsed?.info?.supply || '0';

      console.log(`   LP Token Supply: ${supply}`);

      if (supply === '0') {
        console.log('   ✅ LP TOKENS BURNED - POOL PERMANENTLY LOCKED\n');
      } else {
        console.log('   ⚠️  LP tokens may not be fully burned yet\n');
      }
    } else {
      console.log('⚠️  No LP tokens found to burn\n');
    }

    // Display summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎉 POOL CREATION COMPLETE\n');
    console.log('📊 Pool Details:');
    console.log(`   Pool ID: ${poolId}`);
    console.log(`   LP Mint: ${lpMint}`);
    console.log(`   Token A: ${wsolMint.symbol} (${wsolMint.address})`);
    console.log(`   Token B: ${customToken.symbol || 'Custom'} (${customToken.address})`);
    console.log(`   Initial Liquidity: ${(Number(solForPool) / 1e9).toFixed(4)} SOL / ${(Number(tokensForPool) / 1e9).toLocaleString()} tokens\n`);

    console.log('🔗 Verification Links:');
    const explorerBase = isMainnet ? 'https://solscan.io' : 'https://solscan.io/?cluster=devnet';
    console.log(`   Pool Creation: ${explorerBase}/tx/${txId}`);
    console.log(`   LP Burn: ${explorerBase}/tx/${burnSig}`);
    console.log(`   LP Mint: ${explorerBase}/token/${lpMint}`);
    console.log(`   Pool: https://raydium.io/liquidity/pools/?mode=cpmm&pool_id=${poolId}\n`);

    console.log('🔒 Security Status:');
    console.log(`   LP Tokens: ${supply === '0' ? '✅ BURNED' : '⚠️  NOT FULLY BURNED'}`);
    console.log(`   Pool: ${supply === '0' ? '✅ PERMANENTLY LOCKED' : '⚠️  TOKENS MAY EXIST'}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Save pool info
    const poolInfo = {
      timestamp: new Date().toISOString(),
      network: NETWORK,
      poolId: poolId,
      lpMint: lpMint,
      tokenA: {
        mint: wsolMint.address,
        symbol: wsolMint.symbol,
        amount: Number(solForPool) / 1e9,
      },
      tokenB: {
        mint: customToken.address,
        symbol: customToken.symbol || 'Custom',
        amount: Number(tokensForPool) / 1e9,
      },
      transactions: {
        create: txId,
        burn: burnSig,
      },
      lpBurned: supply === '0',
    };

    const outputPath = path.join(__dirname, `pool-creation-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(poolInfo, null, 2));
    console.log(`💾 Pool info saved: ${outputPath}\n`);

  } catch (error) {
    console.error('\n❌ Pool creation failed:', error.message);
    if (error.logs) {
      console.error('\nTransaction logs:');
      error.logs.forEach(log => console.error('  ', log));
    }
    throw error;
  }
}

// Run main function
main()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Script failed:', err);
    process.exit(1);
  });
