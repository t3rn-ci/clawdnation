#!/bin/bash
# Start ClawdNation server on MAINNET

echo "🚀 Starting ClawdNation server on MAINNET..."
echo ""
echo "⚠️  WARNING: This will use REAL SOL on mainnet!"
echo "   Press Ctrl+C within 5 seconds to cancel..."
sleep 5

export NETWORK=mainnet
export SOLANA_RPC=https://api.mainnet-beta.solana.com
export PORT=3333

echo ""
echo "Starting server..."
node serve.js
