#!/bin/bash
# Start ClawdNation server on DEVNET

echo "🧪 Starting ClawdNation server on DEVNET..."

export NETWORK=devnet
export SOLANA_RPC=https://rpc.ankr.com/solana_devnet
export PORT=3333

echo ""
echo "Starting server..."
node serve.js
