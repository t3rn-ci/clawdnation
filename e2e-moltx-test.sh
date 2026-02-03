#!/bin/bash
# E2E Test: moltx.io ClawdNation Bot Integration
# Usage: ./e2e-moltx-test.sh

set -e

echo "🧪 ClawdNation moltx.io E2E Test Suite"
echo "======================================"
echo ""

# Configuration
TOKEN_MINT="3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG"
BOOTSTRAP_PROGRAM="BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN"
DISPENSER_PROGRAM="AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ"
RPC_URL="https://api.mainnet-beta.solana.com"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to run test
run_test() {
  local test_name=$1
  local test_command=$2

  echo -e "🔄 Running: ${YELLOW}$test_name${NC}"
  ((TESTS_TOTAL++))

  if eval "$test_command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}: $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $test_name"
    ((TESTS_FAILED++))
  fi
  echo ""
}

# Test 1: Verify token metadata
echo "📋 Test Suite 1: Token Metadata Verification"
echo "--------------------------------------------"

run_test "Token exists on mainnet" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q 'Address:'"

run_test "Supply is 1 billion tokens" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q '1000000000000000000'"

run_test "Mint authority is revoked" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep 'Mint authority' | grep -q 'not set'"

run_test "Freeze authority is revoked" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep 'Freeze authority' | grep -q 'not set'"

run_test "Decimals are 9 (standard)" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q 'Decimals: 9'"

# Test 2: Verify on-chain programs
echo "📋 Test Suite 2: On-Chain Program Verification"
echo "--------------------------------------------"

run_test "Bootstrap program deployed" \
  "solana account $BOOTSTRAP_PROGRAM --url $RPC_URL | grep -q 'Balance:'"

run_test "Dispenser program deployed" \
  "solana account $DISPENSER_PROGRAM --url $RPC_URL | grep -q 'Balance:'"

# Test 3: Token security checks
echo "📋 Test Suite 3: Security Verification"
echo "--------------------------------------------"

# Check token program is standard SPL
run_test "Uses standard SPL token program" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'"

# Verify no mint authority
MINT_AUTH=$(spl-token display $TOKEN_MINT --url $RPC_URL | grep "Mint authority" | grep -o "not set" || echo "FAIL")
if [ "$MINT_AUTH" == "not set" ]; then
  echo -e "${GREEN}✅ PASS${NC}: No new tokens can be minted (authority revoked)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Mint authority NOT revoked - CRITICAL SECURITY ISSUE!"
  ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))
echo ""

# Verify no freeze authority
FREEZE_AUTH=$(spl-token display $TOKEN_MINT --url $RPC_URL | grep "Freeze authority" | grep -o "not set" || echo "FAIL")
if [ "$FREEZE_AUTH" == "not set" ]; then
  echo -e "${GREEN}✅ PASS${NC}: Accounts cannot be frozen (authority revoked)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Freeze authority NOT revoked - SECURITY RISK!"
  ((TESTS_FAILED++))
fi
((TESTS_TOTAL++))
echo ""

# Test 4: Bot integration (informational)
echo "📋 Test Suite 4: Bot Integration (Manual Verification Required)"
echo "--------------------------------------------"
echo "⚠️  The following tests require manual interaction with the bot:"
echo ""
echo "   1. 🐦 Tweet Distribution Test:"
echo "      - Tweet: '#clawdnation test distribution to <YOUR_WALLET>'"
echo "      - Expected: Tokens distributed within 15 seconds"
echo "      - Verify at: https://explorer.solana.com/address/$TOKEN_MINT"
echo ""
echo "   2. 💰 SOL Contribution Test:"
echo "      - Send 0.1 SOL to bootstrap program"
echo "      - Expected: Automatic token allocation via bonding curve"
echo "      - Target latency: <15 seconds"
echo ""
echo "   3. 🏭 Token Factory Test:"
echo "      - Tweet: '#clawdnation create MyToken MYTK 1000000000'"
echo "      - Expected: New token deployed within 30 seconds"
echo ""
echo "📊 Manual tests should be documented in E2E_MOLTX_BOT_TEST.md"
echo ""

# Test 5: Performance benchmarks (informational)
echo "📋 Test Suite 5: Performance Benchmarks"
echo "--------------------------------------------"
echo "📈 Target Metrics:"
echo "   - Distribution Latency: <15 seconds ⏱️"
echo "   - Token Creation: <30 seconds 🏭"
echo "   - Rate Limit: 100/hour 🚦"
echo "   - Success Rate: >99% ✅"
echo "   - Gas Efficiency: <0.01 SOL ⛽"
echo ""
echo "🔍 Monitor at: https://moltx.io/ClawdNation_bot"
echo ""

# Summary
echo "======================================"
echo "📊 Automated Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_TOTAL"
echo -e "Passed: ${GREEN}✅ $TESTS_PASSED${NC}"
echo -e "Failed: ${RED}❌ $TESTS_FAILED${NC}"
echo ""

# Security summary
if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All automated tests PASSED!${NC}"
  echo ""
  echo "✅ Token Security Status: VERIFIED"
  echo "   - Supply: Fixed at 1 billion tokens"
  echo "   - Mint Authority: Revoked ✅"
  echo "   - Freeze Authority: Revoked ✅"
  echo "   - Token Program: Standard SPL ✅"
  echo ""
  echo "⏭️  Next Steps:"
  echo "   1. Run manual bot integration tests"
  echo "   2. Verify LP burn (if pool created)"
  echo "   3. Audit token distribution"
  echo "   4. Monitor bot performance"
  echo ""
  echo "📄 Full audit report: MAINNET_TOKEN_AUDIT.md"
  echo "🧪 E2E test plan: E2E_MOLTX_BOT_TEST.md"
  exit 0
else
  echo -e "${RED}⚠️  Some automated tests FAILED!${NC}"
  echo ""
  echo "🚨 Critical Issues Found:"
  echo "   - Review failed tests above"
  echo "   - Check token security settings"
  echo "   - Verify on-chain programs"
  echo ""
  echo "📄 See: MAINNET_TOKEN_AUDIT.md for full details"
  exit 1
fi
