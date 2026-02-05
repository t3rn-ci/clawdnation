#!/usr/bin/env node
/**
 * CLWDN Mainnet — Raydium CPMM Pool Creation + LP Burn
 *
 * Creates a CLWDN/SOL pool on Raydium CPMM and immediately burns ALL LP tokens.
 *
 * Pool: 10,000 CLWDN + 1 SOL (price = 0.0001 SOL/CLWDN = bootstrap rate)
 *
 * Usage:
 *   node create-pool-and-burn.js              # dry-run (default)
 *   node create-pool-and-burn.js --dry-run    # explicit dry-run
 *   node create-pool-and-burn.js --execute    # actually create pool + burn LP
 */

const {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
} = require("@raydium-io/raydium-sdk-v2");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createBurnInstruction,
  getAccount,
  getAssociatedTokenAddress,
} = require("@solana/spl-token");
const BN = require("bn.js");
const bs58 = require("bs58");
const fs = require("fs");

// ─── Config ─────────────────────────────────────────────────────────────────
const RPC_URL = "https://api.mainnet-beta.solana.com";
const CLWDN_MINT = new PublicKey("3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG");
const CLWDN_DECIMALS = 9;
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Pool parameters
const CLWDN_AMOUNT = 10_000;  // 10,000 CLWDN
const SOL_AMOUNT = 1;          // 1 SOL

// Keypairs
const DEPLOYER_PATH = "/root/.config/solana/clawdnation.json";
const LP_WALLET_PATH = "/root/.config/solana/clwdn-wallets/lp.json";

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function separator() {
  console.log("═".repeat(72));
}

async function fetchTokenAccountData(connection, owner) {
  const solAccountResp = await connection.getAccountInfo(owner.publicKey);
  const tokenAccountResp = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID });
  const token2022Req = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_2022_PROGRAM_ID });
  return parseTokenAccountResp({
    owner: owner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const dryRun = !execute;

  console.log();
  separator();
  console.log("  🌊 CLWDN Raydium CPMM Pool Creation + LP Burn — Mainnet");
  console.log(`  Mode: ${dryRun ? "🔍 DRY RUN (no transactions)" : "🚀 EXECUTE (real transactions!)"}`);
  separator();
  console.log();

  // Load keypairs
  const deployer = loadKeypair(DEPLOYER_PATH);
  const lpWallet = loadKeypair(LP_WALLET_PATH);

  console.log("📋 Configuration:");
  console.log(`   CLWDN Mint:        ${CLWDN_MINT.toBase58()}`);
  console.log(`   SOL Mint:          ${SOL_MINT.toBase58()}`);
  console.log(`   CLWDN Amount:      ${CLWDN_AMOUNT.toLocaleString()} CLWDN`);
  console.log(`   SOL Amount:        ${SOL_AMOUNT} SOL`);
  console.log(`   Price:             ${SOL_AMOUNT / CLWDN_AMOUNT} SOL/CLWDN (= bootstrap rate)`);
  console.log(`   Deployer:          ${deployer.publicKey.toBase58()}`);
  console.log(`   LP Wallet:         ${lpWallet.publicKey.toBase58()}`);
  console.log(`   RPC:               ${RPC_URL}`);
  console.log();

  // Connect
  const connection = new Connection(RPC_URL, "confirmed");

  // Check balances
  const deployerSol = await connection.getBalance(deployer.publicKey);
  const lpSol = await connection.getBalance(lpWallet.publicKey);

  console.log("💰 Current Balances:");
  console.log(`   Deployer SOL:      ${(deployerSol / 1e9).toFixed(6)} SOL`);
  console.log(`   LP Wallet SOL:     ${(lpSol / 1e9).toFixed(6)} SOL`);

  // Check CLWDN balance on LP wallet
  try {
    const lpClwdnAta = await getAssociatedTokenAddress(CLWDN_MINT, lpWallet.publicKey);
    const lpClwdnAccount = await getAccount(connection, lpClwdnAta);
    console.log(`   LP Wallet CLWDN:   ${(Number(lpClwdnAccount.amount) / 1e9).toLocaleString()} CLWDN`);
  } catch {
    console.log(`   LP Wallet CLWDN:   0 (no ATA)`);
  }

  // Check deployer CLWDN
  try {
    const deployerClwdnAta = await getAssociatedTokenAddress(CLWDN_MINT, deployer.publicKey);
    const deployerClwdnAccount = await getAccount(connection, deployerClwdnAta);
    console.log(`   Deployer CLWDN:    ${(Number(deployerClwdnAccount.amount) / 1e9).toLocaleString()} CLWDN`);
  } catch {
    console.log(`   Deployer CLWDN:    0 (no ATA)`);
  }
  console.log();

  // Cost estimate
  const poolCreationFee = 0.4;  // Raydium CPMM fee
  const solForPool = SOL_AMOUNT;
  const totalSolNeeded = poolCreationFee + solForPool + 0.01; // + rent/fees
  console.log("📊 Cost Estimate:");
  console.log(`   Pool creation fee: ~${poolCreationFee} SOL`);
  console.log(`   SOL liquidity:     ${solForPool} SOL`);
  console.log(`   Rent/tx fees:      ~0.01 SOL`);
  console.log(`   Total needed:      ~${totalSolNeeded.toFixed(2)} SOL`);
  console.log(`   Available:         ${(deployerSol / 1e9).toFixed(6)} SOL`);

  if (deployerSol / 1e9 < totalSolNeeded) {
    console.log(`   ❌ INSUFFICIENT SOL! Need ~${totalSolNeeded.toFixed(2)}, have ${(deployerSol / 1e9).toFixed(4)}`);
    if (!dryRun) process.exit(1);
  } else {
    console.log(`   ✅ Sufficient SOL`);
  }
  console.log();

  // Steps overview
  console.log("📝 Execution Plan:");
  console.log("   1. Transfer 10,000 CLWDN from LP wallet → Deployer");
  console.log("   2. Create Raydium CPMM pool (CLWDN/SOL)");
  console.log("   3. Burn ALL LP tokens received");
  console.log("   4. Verify LP token balance = 0");
  console.log();

  if (dryRun) {
    separator();
    console.log("  🔍 DRY RUN complete. No transactions sent.");
    console.log("  Run with --execute to create the pool and burn LP tokens.");
    separator();
    return;
  }

  // ─── Execute ──────────────────────────────────────────────────────────────
  console.log("⚠️  EXECUTING in 5 seconds... Press Ctrl+C to abort.");
  await new Promise((r) => setTimeout(r, 5000));

  // Step 1: Transfer CLWDN from LP wallet to deployer
  separator();
  console.log("  Step 1: Transferring CLWDN from LP wallet → Deployer...");
  separator();

  const { createTransferInstruction, getOrCreateAssociatedTokenAccount } = require("@solana/spl-token");

  // Fund LP wallet with SOL for tx fee (it only has 0.016 SOL)
  const { SystemProgram } = require("@solana/web3.js");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: deployer.publicKey,
      toPubkey: lpWallet.publicKey,
      lamports: 10_000_000, // 0.01 SOL for fees
    })
  );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [deployer]);
  console.log(`   Funded LP wallet: ${fundSig}`);

  // Create deployer ATA if needed, then transfer
  const deployerAta = await getOrCreateAssociatedTokenAccount(
    connection, deployer, CLWDN_MINT, deployer.publicKey
  );
  const lpAta = await getAssociatedTokenAddress(CLWDN_MINT, lpWallet.publicKey);

  const clwdnRaw = new BN(CLWDN_AMOUNT).mul(new BN(10).pow(new BN(CLWDN_DECIMALS)));
  const transferTx = new Transaction().add(
    createTransferInstruction(
      lpAta,
      deployerAta.address,
      lpWallet.publicKey,
      BigInt(clwdnRaw.toString())
    )
  );
  const transferSig = await sendAndConfirmTransaction(connection, transferTx, [lpWallet]);
  console.log(`   Transferred ${CLWDN_AMOUNT.toLocaleString()} CLWDN: ${transferSig}`);
  console.log();

  // Step 2: Create Raydium CPMM pool
  separator();
  console.log("  Step 2: Creating Raydium CPMM Pool...");
  separator();

  console.log("   Initializing Raydium SDK...");
  const raydium = await Raydium.load({
    owner: deployer,
    connection,
    cluster: "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: "finalized",
  });

  console.log("   Fetching CPMM fee configs...");
  const feeConfigs = await raydium.api.getCpmmConfigs();
  console.log(`   Found ${feeConfigs.length} fee configs`);

  // Use the first (default) fee config
  const feeConfig = feeConfigs[0];
  console.log(`   Using fee config: index=${feeConfig.index}, tradeFeeRate=${feeConfig.tradeFeeRate}`);

  // Provide mint info directly to avoid API lookups
  const mintA = {
    address: CLWDN_MINT.toBase58(),
    programId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: CLWDN_DECIMALS,
  };
  const mintB = {
    address: SOL_MINT.toBase58(),
    programId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: 9,
  };

  console.log("   Creating pool transaction...");
  const mintAAmount = new BN(CLWDN_AMOUNT).mul(new BN(10).pow(new BN(CLWDN_DECIMALS)));
  const mintBAmount = new BN(SOL_AMOUNT).mul(new BN(10).pow(new BN(9)));

  const { execute: executePool, extInfo, transaction } = await raydium.cpmm.createPool({
    programId: CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount: mintAAmount,
    mintBAmount: mintBAmount,
    startTime: new BN(0),
    feeConfig,
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion: TxVersion.V0,
  });

  console.log("   Pool addresses:");
  for (const [key, value] of Object.entries(extInfo.address)) {
    console.log(`     ${key}: ${value.toString()}`);
  }
  console.log();

  console.log("   Sending pool creation transaction...");
  const { txId: poolTxId } = await executePool({ sendAndConfirm: true });
  console.log(`   ✅ Pool created!`);
  console.log(`   TX: ${poolTxId}`);
  console.log(`   Explorer: https://solscan.io/tx/${poolTxId}`);
  console.log();

  // Step 3: Burn LP tokens
  separator();
  console.log("  Step 3: Burning ALL LP tokens...");
  separator();

  // Wait a moment for state to settle
  await new Promise((r) => setTimeout(r, 3000));

  // Find LP mint from pool info
  const lpMint = extInfo.address.lpMint;
  console.log(`   LP Mint: ${lpMint.toString()}`);

  // Get deployer's LP token account
  const lpTokenAta = await getAssociatedTokenAddress(
    new PublicKey(lpMint.toString()),
    deployer.publicKey
  );

  const lpTokenAccount = await getAccount(connection, lpTokenAta);
  const lpBalance = lpTokenAccount.amount;
  console.log(`   LP Token Balance: ${lpBalance.toString()}`);

  if (lpBalance > 0n) {
    const burnTx = new Transaction().add(
      createBurnInstruction(
        lpTokenAta,
        new PublicKey(lpMint.toString()),
        deployer.publicKey,
        lpBalance
      )
    );
    const burnSig = await sendAndConfirmTransaction(connection, burnTx, [deployer]);
    console.log(`   🔥 BURNED ${lpBalance.toString()} LP tokens!`);
    console.log(`   TX: ${burnSig}`);
    console.log(`   Explorer: https://solscan.io/tx/${burnSig}`);
  } else {
    console.log(`   ⚠️  No LP tokens to burn (balance is 0)`);
  }
  console.log();

  // Step 4: Verify
  separator();
  console.log("  Step 4: Verification...");
  separator();

  try {
    const finalLpAccount = await getAccount(connection, lpTokenAta);
    console.log(`   LP Token Balance: ${finalLpAccount.amount.toString()}`);
    if (finalLpAccount.amount === 0n) {
      console.log("   ✅ ALL LP TOKENS BURNED — Liquidity permanently locked!");
    } else {
      console.log("   ⚠️  LP tokens still exist!");
    }
  } catch {
    console.log("   ✅ LP token account closed — ALL tokens burned!");
  }

  console.log();
  separator();
  console.log("  🎉 Pool creation + LP burn complete!");
  console.log(`  Pool: ${extInfo.address.poolId?.toString() || "check tx"}`);
  console.log(`  LP Mint: ${lpMint.toString()}`);
  console.log(`  Pool TX: ${poolTxId}`);
  separator();
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
