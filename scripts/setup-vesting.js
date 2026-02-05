#!/usr/bin/env node
/**
 * CLWDN Mainnet Vesting Setup via Streamflow
 * 
 * Creates two 12-month linear vesting contracts:
 *   1. Team tokens:    150,000,000 CLWDN → 3DAZTJRxzyLkqzvqiqYZrUcAmM2CHKG7VJe69Rb24iQQ
 *   2. Staking tokens: 150,000,000 CLWDN → BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8
 *
 * Usage:
 *   node setup-vesting.js              # dry-run (default)
 *   node setup-vesting.js --dry-run    # explicit dry-run
 *   node setup-vesting.js --execute    # actually send transactions
 */

const { SolanaStreamClient, getBN } = require("@streamflow/stream");
const { Keypair, Connection, PublicKey } = require("@solana/web3.js");
const BN = require("bn.js");
const fs = require("fs");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL = "https://api.mainnet-beta.solana.com";
const CLWDN_MINT = "3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG";
const CLWDN_DECIMALS = 9;

const VESTING_CONTRACTS = [
  {
    name: "Team Tokens",
    recipientWallet: "3DAZTJRxzyLkqzvqiqYZrUcAmM2CHKG7VJe69Rb24iQQ",
    senderKeypairPath: "/root/.config/solana/clwdn-wallets/team.json",
    totalTokens: 150_000_000,
  },
  {
    name: "Staking Tokens",
    recipientWallet: "BSrpfnzfRb9nwLqkk2Jjg9cwAK7YSb59m5eh7pie6PC8",
    senderKeypairPath: "/root/.config/solana/clwdn-wallets/staking.json",
    totalTokens: 150_000_000,
  },
];

const PERIOD_SECONDS = 86400;       // 1 day
const DURATION_DAYS = 365;          // 12 months ≈ 365 days
const DURATION_SECONDS = DURATION_DAYS * PERIOD_SECONDS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function toRawAmount(tokens) {
  return new BN(tokens).mul(new BN(10).pow(new BN(CLWDN_DECIMALS)));
}

function formatTokens(raw) {
  const str = raw.toString();
  const decimals = CLWDN_DECIMALS;
  if (str.length <= decimals) return `0.${str.padStart(decimals, "0")}`;
  return `${str.slice(0, str.length - decimals)}.${str.slice(str.length - decimals)}`;
}

function separator() {
  console.log("═".repeat(72));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const dryRun = !execute;

  console.log();
  separator();
  console.log("  🐾 CLWDN Streamflow Vesting Setup — Mainnet");
  console.log(`  Mode: ${dryRun ? "🔍 DRY RUN (no transactions will be sent)" : "🚀 EXECUTE (transactions WILL be sent!)"}`);
  separator();
  console.log();

  // Print config summary
  console.log("📋 Global Configuration:");
  console.log(`   CLWDN Mint:      ${CLWDN_MINT}`);
  console.log(`   Decimals:        ${CLWDN_DECIMALS}`);
  console.log(`   RPC:             ${RPC_URL}`);
  console.log(`   Vesting Period:  ${PERIOD_SECONDS}s (1 day)`);
  console.log(`   Total Duration:  ${DURATION_DAYS} days (12 months)`);
  console.log(`   Cliff:           None (0)`);
  console.log(`   canTopup:        false`);
  console.log(`   cancelable:      false (sender & recipient)`);
  console.log(`   transferable:    false`);
  console.log();

  // Validate keypairs exist
  for (const vc of VESTING_CONTRACTS) {
    if (!fs.existsSync(vc.senderKeypairPath)) {
      console.error(`❌ Keypair not found: ${vc.senderKeypairPath}`);
      process.exit(1);
    }
  }

  // Print each contract details
  for (const vc of VESTING_CONTRACTS) {
    const keypair = loadKeypair(vc.senderKeypairPath);
    const totalRaw = toRawAmount(vc.totalTokens);
    const amountPerPeriod = totalRaw.div(new BN(DURATION_DAYS));
    const remainder = totalRaw.sub(amountPerPeriod.mul(new BN(DURATION_DAYS)));

    separator();
    console.log(`  📝 Contract: ${vc.name}`);
    separator();
    console.log(`   Sender/Authority:   ${keypair.publicKey.toBase58()}`);
    console.log(`   Keypair:            ${vc.senderKeypairPath}`);
    console.log(`   Recipient:          ${vc.recipientWallet}`);
    console.log(`   Total Amount:       ${vc.totalTokens.toLocaleString()} CLWDN`);
    console.log(`   Total Raw:          ${totalRaw.toString()} (${CLWDN_DECIMALS} decimals)`);
    console.log(`   Amount Per Period:  ${formatTokens(amountPerPeriod)} CLWDN/day`);
    console.log(`   Periods:            ${DURATION_DAYS}`);
    if (!remainder.isZero()) {
      console.log(`   ⚠️  Remainder:       ${formatTokens(remainder)} CLWDN (dust from division)`);
      console.log(`       Note: Streamflow handles remainder in the last period.`);
    }
    console.log();
  }

  if (dryRun) {
    console.log("🔍 DRY RUN complete. No transactions sent.");
    console.log("   Run with --execute to create the vesting contracts.");
    console.log();
    return;
  }

  // ─── Execute mode ─────────────────────────────────────────────────────────
  console.log("⚠️  EXECUTING in 5 seconds... Press Ctrl+C to abort.");
  await new Promise((r) => setTimeout(r, 5000));

  const client = new SolanaStreamClient(RPC_URL);

  for (const vc of VESTING_CONTRACTS) {
    const keypair = loadKeypair(vc.senderKeypairPath);
    const totalRaw = toRawAmount(vc.totalTokens);
    const amountPerPeriod = totalRaw.div(new BN(DURATION_DAYS));
    const now = Math.floor(Date.now() / 1000);

    separator();
    console.log(`  🚀 Creating vesting: ${vc.name}...`);
    separator();

    const createStreamParams = {
      recipient: vc.recipientWallet,
      tokenId: CLWDN_MINT,
      start: now + 30,  // start 30s from now to allow tx confirmation
      amount: totalRaw,
      period: PERIOD_SECONDS,
      cliff: 0,
      cliffAmount: new BN(0),
      amountPerPeriod: amountPerPeriod,
      name: vc.name.replace(/\s+/g, "_"),
      canTopup: false,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      withdrawalFrequency: 0,
      partner: null,
    };

    console.log("   Params:", JSON.stringify({
      ...createStreamParams,
      amount: createStreamParams.amount.toString(),
      cliffAmount: createStreamParams.cliffAmount.toString(),
      amountPerPeriod: createStreamParams.amountPerPeriod.toString(),
    }, null, 2));
    console.log();

    try {
      const solanaParams = {
        sender: keypair,
        isNative: false,
      };

      const { ixs, tx, metadata } = await client.create(createStreamParams, solanaParams);

      console.log(`   ✅ Vesting contract created!`);
      console.log(`   Stream ID:  ${metadata?.publicKey || "check tx"}`);
      console.log(`   TX Hash:    ${tx}`);
      console.log(`   Explorer:   https://solscan.io/tx/${tx}`);
      console.log();
    } catch (err) {
      console.error(`   ❌ Failed to create ${vc.name}:`, err.message || err);
      console.error("   Full error:", err);
      console.log();
    }
  }

  separator();
  console.log("  ✅ Vesting setup complete!");
  separator();
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
