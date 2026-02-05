#!/bin/bash
# Upgrade Bootstrap Program with Rate Fix
#
# WHAT THIS DOES:
# 1. Deploys fixed bootstrap program to mainnet
# 2. Keeps same program ID (upgrade, not redeploy)
# 3. Existing state accounts remain (need manual migration)
#
# CRITICAL: After upgrade, you must:
# 1. Refund 0.02 SOL to contributor GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE
# 2. Close old bootstrap state
# 3. Initialize new bootstrap state with correct params
#
# Upgrade Authority: GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE

set -e

echo "════════════════════════════════════════════════"
echo "  Bootstrap Program Upgrade - Rate Fix"
echo "════════════════════════════════════════════════"
echo ""
echo "Program ID: 91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No"
echo "Authority: GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE"
echo ""
echo "⚠️  WARNING: This will upgrade the MAINNET program!"
echo "   Press Ctrl+C within 10 seconds to cancel..."
sleep 10

echo ""
echo "Building program..."
anchor build

echo ""
echo "Deploying to mainnet..."
echo "This will take a few minutes and cost ~2 SOL in gas..."
echo ""

solana program deploy \
  --program-id target/deploy/bootstrap-keypair.json \
  --url mainnet-beta \
  target/sbpf-solana-solana/release/bootstrap.so \
  --upgrade-authority ~/.config/solana/id.json

echo ""
echo "════════════════════════════════════════════════"
echo "  ✅ PROGRAM UPGRADED SUCCESSFULLY!"
echo "════════════════════════════════════════════════"
echo ""
echo "⚠️  NEXT STEPS (REQUIRED):"
echo ""
echo "1. Refund existing contributor:"
echo "   solana transfer GyQga5Dui9ym8X4FBLjFjeGmgXA81YGHpLJGcTdzCGRE 0.02 \\"
echo "     --url mainnet-beta \\"
echo "     --allow-unfunded-recipient"
echo ""
echo "2. Close old bootstrap state (reclaim rent):"
echo "   anchor run close-state --provider.cluster mainnet"
echo ""
echo "3. Initialize new bootstrap with correct params:"
echo "   anchor run init-mainnet --provider.cluster mainnet"
echo ""
echo "4. Verify new state:"
echo "   node scripts/fix-bootstrap-rate.js"
echo ""
echo "════════════════════════════════════════════════"
