#!/bin/bash

# BONDING CURVE DEPLOYMENT SCRIPT
# Automates the entire deployment process

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      BONDING CURVE DEPLOYMENT - CLAWDNATION                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NETWORK=${1:-devnet}
MODE=${2:-test}  # test or production

echo "📋 Configuration:"
echo "  Network: $NETWORK"
echo "  Mode: $MODE"
echo ""

# Step 1: Backup and replace contract
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Prepare Contract"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd ../bootstrap

# Backup original
if [ ! -f "programs/bootstrap/src/lib_backup.rs" ]; then
    echo "📦 Backing up original contract..."
    cp programs/bootstrap/src/lib.rs programs/bootstrap/src/lib_backup.rs
    echo -e "${GREEN}✅ Backup created${NC}"
else
    echo "✅ Backup already exists"
fi

# Use bonding curve version
echo "📝 Copying bonding curve contract..."
cp programs/bootstrap/src/lib_bonding_curve.rs programs/bootstrap/src/lib.rs
echo -e "${GREEN}✅ Contract ready${NC}"
echo ""

# Step 2: Build
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Build Contract"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🔨 Building with Anchor..."
anchor build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo ""

# Step 3: Deploy
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Deploy to $NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$MODE" == "production" ]; then
    echo -e "${YELLOW}⚠️  PRODUCTION DEPLOYMENT${NC}"
    echo "   This will deploy to $NETWORK with real funds!"
    echo ""
    read -p "   Type 'DEPLOY' to confirm: " confirm
    if [ "$confirm" != "DEPLOY" ]; then
        echo -e "${RED}❌ Deployment cancelled${NC}"
        exit 1
    fi
fi

echo "🚀 Deploying..."
anchor deploy --provider.cluster $NETWORK

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi
echo ""

# Step 4: Get program ID
PROGRAM_ID=$(solana address -k target/deploy/clwdn_bootstrap-keypair.json)
echo "📍 Program ID: $PROGRAM_ID"
echo ""

# Step 5: Fund dispenser
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Fund Dispenser"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd ../solana

if [ "$MODE" == "test" ]; then
    AMOUNT="1000000"  # 1M for testing
else
    AMOUNT="100000000"  # 100M for production
fi

echo "💰 Transferring $AMOUNT CLWDN to dispenser..."
echo ""

spl-token transfer \
    2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3 \
    $AMOUNT \
    BxfPAP6D8hYZQ9mnLpbVkLdByrYmkSHY4wJPpQE7278w \
    --url $NETWORK \
    --fund-recipient

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dispenser funded${NC}"
else
    echo -e "${YELLOW}⚠️  Dispenser funding failed (may already have funds)${NC}"
fi
echo ""

# Step 6: Self-boot test
if [ "$MODE" == "test" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "STEP 5: Self-Boot Test"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    echo "🧪 Running self-boot test (1 SOL)..."
    echo ""

    node launch-bonding-curve.js --bootstrap --self-boot

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Self-boot test passed${NC}"
    else
        echo -e "${RED}❌ Self-boot test failed${NC}"
        exit 1
    fi
    echo ""
fi

# Step 7: Visualize
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 6: Visualization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📊 Generating curve visualization..."
node visualize-curve.js > curve-visualization.txt
echo -e "${GREEN}✅ Saved to: curve-visualization.txt${NC}"
echo ""

echo "🌐 HTML visualization available at:"
echo "   file://$(pwd)/bonding-curve-viz.html"
echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              ✅ DEPLOYMENT COMPLETE!                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

echo "📋 Summary:"
echo "  ✅ Contract deployed to $NETWORK"
echo "  ✅ Program ID: $PROGRAM_ID"
echo "  ✅ Dispenser funded"
if [ "$MODE" == "test" ]; then
    echo "  ✅ Self-boot test passed"
fi
echo "  ✅ Visualizations generated"
echo ""

echo "🚀 Next Steps:"
echo ""

if [ "$MODE" == "test" ]; then
    echo "  FOR PRODUCTION:"
    echo "  1. Test thoroughly on devnet"
    echo "  2. Review security audit"
    echo "  3. Deploy to mainnet:"
    echo "     ./deploy-bonding-curve.sh mainnet production"
    echo ""
else
    echo "  LAUNCH:"
    echo "  1. node launch-bonding-curve.js --bootstrap"
    echo "  2. Monitor: node visualize-curve.js --live"
    echo "  3. After complete: Create LP + burn tokens"
    echo ""
fi

echo "📚 Documentation:"
echo "  - Complete guide: BONDING_CURVE_COMPLETE.md"
echo "  - Security audit: SECURITY_AUDIT.md"
echo "  - Visualization: bonding-curve-viz.html"
echo ""

echo "🎊 Ready to launch ClawdNation!"
echo ""
