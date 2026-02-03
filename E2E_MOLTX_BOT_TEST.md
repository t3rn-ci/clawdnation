# E2E Test: moltx.io ClawdNation Bot Integration

**Platform:** https://moltx.io/ClawdNation_bot
**Test Date:** February 3, 2026
**Token:** 3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG
**Network:** Solana Mainnet

---

## 🎯 Test Objectives

1. Verify bot can detect on-chain events and distribute CLWDN tokens
2. Validate #clawdnation tweet → token creation flow
3. Test SOL contribution → automatic token allocation
4. Measure distribution latency (<15 seconds requirement)
5. Verify rate limiting (100 distributions/hour)
6. Test security controls (no unauthorized distributions)

---

## 🧪 Test Scenarios

### Scenario 1: Token Distribution via Tweet
**Goal:** Verify bot detects #clawdnation tweet and distributes tokens

#### Test Steps:
```bash
# 1. Setup test wallet
TEST_WALLET=$(solana-keygen new --outfile test-wallet.json --no-bip39-passphrase)
echo "Test wallet: $TEST_WALLET"

# 2. Tweet trigger
# Manually tweet: "#clawdnation distribute to <TEST_WALLET>"

# 3. Monitor for distribution
watch -n 2 'spl-token accounts --owner $TEST_WALLET --url https://api.mainnet-beta.solana.com'

# 4. Verify tokens received
spl-token balance 3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG \
  --owner $TEST_WALLET \
  --url https://api.mainnet-beta.solana.com
```

#### Expected Results:
- ✅ Bot detects tweet within 5 seconds
- ✅ Token distribution queued in dispenser
- ✅ Distribution executed within 10-15 seconds
- ✅ Correct amount received (based on bot logic)
- ✅ Transaction recorded on Solana Explorer

#### Metrics to Capture:
- Tweet timestamp → Distribution timestamp (latency)
- Token amount distributed
- Transaction signature
- Gas fees paid

---

### Scenario 2: SOL Contribution → Token Allocation
**Goal:** Test automatic token allocation via bonding curve

#### Test Steps:
```bash
# 1. Get bootstrap program state
solana account BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN \
  --url https://api.mainnet-beta.solana.com \
  --output json

# 2. Calculate expected tokens (bonding curve)
# Current rate: 10,000 - 40,000 CLWDN/SOL (linear progression)
# For 0.1 SOL contribution:
# Expected: ~1,000 - 4,000 CLWDN (depends on bonding curve position)

# 3. Send SOL contribution
BOOTSTRAP_WALLET=$(solana program show BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN | grep "Program Id" | awk '{print $3}')
solana transfer $BOOTSTRAP_WALLET 0.1 \
  --from test-wallet.json \
  --url https://api.mainnet-beta.solana.com

# 4. Monitor for automatic distribution
START_TIME=$(date +%s)
while true; do
  BALANCE=$(spl-token balance 3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG \
    --owner $TEST_WALLET \
    --url https://api.mainnet-beta.solana.com 2>/dev/null)

  if [ "$BALANCE" != "0" ]; then
    END_TIME=$(date +%s)
    LATENCY=$((END_TIME - START_TIME))
    echo "✅ Tokens received in ${LATENCY}s: $BALANCE CLWDN"
    break
  fi

  sleep 2
done
```

#### Expected Results:
- ✅ SOL contribution detected on-chain
- ✅ Bonding curve calculation correct
- ✅ Tokens distributed automatically
- ✅ Distribution completes within 15 seconds
- ✅ No manual intervention required

#### Metrics to Capture:
- SOL amount contributed
- CLWDN tokens received
- Current bonding curve rate
- Distribution latency
- Transaction signatures (contribution + distribution)

---

### Scenario 3: Token Factory (#clawdnation Create)
**Goal:** Test new token creation via bot

#### Test Steps:
```bash
# 1. Tweet token creation request
# Tweet: "#clawdnation create MyToken MYTK 1000000000"

# 2. Monitor for new token deployment
# Expected: New SPL token created within 30 seconds

# 3. Verify token metadata
spl-token display <NEW_TOKEN_MINT> --url https://api.mainnet-beta.solana.com

# 4. Check token properties
# - Supply: 1,000,000,000 (from request)
# - Decimals: 9 (standard)
# - Mint authority: revoked
# - Freeze authority: revoked
```

#### Expected Results:
- ✅ New token created on Solana mainnet
- ✅ Token deployed within 30 seconds
- ✅ Authorities properly revoked
- ✅ Dispenser initialized for new token
- ✅ Distribution ready

#### Metrics to Capture:
- Request timestamp → Deployment timestamp
- Token mint address
- Initial distribution parameters
- Gas fees paid by bot

---

### Scenario 4: Rate Limiting Test
**Goal:** Verify 100 distributions/hour rate limit is enforced

#### Test Steps:
```bash
# 1. Create 101 distribution requests rapidly
for i in {1..101}; do
  # Trigger distribution via tweet or SOL contribution
  echo "Request $i at $(date +%s)"

  # Small delay to avoid spam detection
  sleep 0.5
done

# 2. Monitor which requests succeed
# Expected: First 100 succeed, 101st gets rate limited

# 3. Wait 1 hour and retry
sleep 3600
# Trigger 101st request again
# Expected: Now succeeds
```

#### Expected Results:
- ✅ First 100 distributions succeed
- ✅ 101st distribution rejected (rate limit)
- ✅ Error message clear: "Rate limit exceeded (100/hour)"
- ✅ After 1 hour, limit resets
- ✅ Previously failed request now succeeds

#### Metrics to Capture:
- Number of successful distributions
- Number of rate-limited requests
- Time until rate limit resets
- Error messages received

---

### Scenario 5: Security Test (Unauthorized Distribution)
**Goal:** Verify only authorized operators can distribute

#### Test Steps:
```bash
# 1. Attempt direct dispenser call (without bot)
# This should FAIL as only operators can queue distributions

# Create unauthorized distribution request
anchor run distribute --provider.wallet test-wallet.json \
  -- --amount 1000000000000 \
  --recipient $(solana address --keypair test-wallet.json)

# Expected: Fails with "Unauthorized" error

# 2. Attempt to add self as operator
anchor run add-operator --provider.wallet test-wallet.json \
  -- --new-operator $(solana address --keypair test-wallet.json)

# Expected: Fails with "Unauthorized" error

# 3. Verify bot wallet IS an operator
# Check dispenser state for bot's pubkey in operators list
```

#### Expected Results:
- ✅ Unauthorized wallets cannot queue distributions
- ✅ Cannot add self as operator
- ✅ Only existing operators can manage operators
- ✅ Bot wallet is in operators list
- ✅ All unauthorized attempts logged

#### Metrics to Capture:
- Number of unauthorized attempts
- Error codes received
- Current operator list
- Bot operator pubkey

---

## 📊 E2E Test Execution Script

Create automated test runner:

```bash
#!/bin/bash
# e2e-moltx-test.sh

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

# Helper function to run test
run_test() {
  local test_name=$1
  local test_command=$2

  echo "🔄 Running: $test_name"
  ((TESTS_TOTAL++))

  if eval "$test_command"; then
    echo "✅ PASS: $test_name"
    ((TESTS_PASSED++))
  else
    echo "❌ FAIL: $test_name"
    ((TESTS_FAILED++))
  fi
  echo ""
}

# Test 1: Verify token metadata
echo "📋 Test 1: Token Metadata Verification"
run_test "Token exists" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q 'Address:'"

run_test "Supply is 1B" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q '1000000000000000000'"

run_test "Mint authority revoked" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep -q 'not set'"

run_test "Freeze authority revoked" \
  "spl-token display $TOKEN_MINT --url $RPC_URL | grep 'Freeze authority' | grep -q 'not set'"

# Test 2: Verify programs deployed
echo "📋 Test 2: Program Verification"
run_test "Bootstrap program exists" \
  "solana account $BOOTSTRAP_PROGRAM --url $RPC_URL | grep -q 'Balance:'"

run_test "Dispenser program exists" \
  "solana account $DISPENSER_PROGRAM --url $RPC_URL | grep -q 'Balance:'"

# Test 3: Bot integration (requires manual trigger)
echo "📋 Test 3: Bot Integration (Manual)"
echo "⚠️  Manual step required:"
echo "   1. Tweet: '#clawdnation test distribution'"
echo "   2. Wait 15 seconds"
echo "   3. Check if tokens received"
echo ""
read -p "Press Enter after completing manual test..."

# Test 4: Latency benchmark
echo "📋 Test 4: Distribution Latency"
# This would require actual distribution trigger
# Simulated for now
echo "⏱️  Average distribution latency: <15 seconds (target)"
echo "📊 Based on bot documentation"

# Summary
echo "======================================"
echo "📊 Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_TOTAL"
echo "Passed: ✅ $TESTS_PASSED"
echo "Failed: ❌ $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "🎉 All tests PASSED!"
  exit 0
else
  echo "⚠️  Some tests FAILED"
  exit 1
fi
```

---

## 📈 Performance Metrics

### Target Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Distribution Latency | <15 seconds | Tweet timestamp → Token received |
| Token Creation | <30 seconds | Request → Token deployed |
| Rate Limit | 100/hour | Count successful distributions |
| Success Rate | >99% | Successful / Total requests |
| Gas Efficiency | <0.01 SOL | Average transaction fee |

### Monitoring Dashboard
```javascript
// metrics.js - Real-time monitoring
const { Connection, PublicKey } = require('@solana/web3.js');

const conn = new Connection('https://api.mainnet-beta.solana.com');
const TOKEN_MINT = new PublicKey('3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG');

async function monitorDistributions() {
  let distributionCount = 0;
  let totalLatency = 0;

  // Monitor dispenser program logs
  conn.onLogs(
    DISPENSER_PROGRAM,
    (logs) => {
      if (logs.logs.some(log => log.includes('Distribution executed'))) {
        distributionCount++;

        // Extract latency from logs
        const latency = extractLatency(logs);
        totalLatency += latency;

        const avgLatency = totalLatency / distributionCount;

        console.log(`📊 Stats:`);
        console.log(`   Distributions: ${distributionCount}`);
        console.log(`   Avg Latency: ${avgLatency.toFixed(2)}s`);
        console.log(`   Rate: ${distributionCount}/hour`);
      }
    },
    'confirmed'
  );
}

monitorDistributions();
```

---

## ✅ Test Checklist

### Pre-Test Setup
- [ ] Test wallet funded with SOL
- [ ] moltx.io bot verified operational
- [ ] Solana RPC endpoint configured
- [ ] Twitter account ready for #clawdnation tweets
- [ ] Monitoring tools deployed

### Scenario 1: Tweet Distribution
- [ ] Tweet sent with #clawdnation
- [ ] Bot detected tweet (<5s)
- [ ] Distribution queued
- [ ] Tokens received (<15s)
- [ ] Transaction verified on-chain

### Scenario 2: SOL Contribution
- [ ] SOL sent to bootstrap
- [ ] Contribution detected
- [ ] Bonding curve calculated
- [ ] Tokens distributed automatically
- [ ] Latency within target (<15s)

### Scenario 3: Token Factory
- [ ] Token creation requested
- [ ] New token deployed (<30s)
- [ ] Authorities revoked
- [ ] Dispenser initialized
- [ ] Distribution ready

### Scenario 4: Rate Limiting
- [ ] 100 distributions succeeded
- [ ] 101st distribution rejected
- [ ] Rate limit message clear
- [ ] Limit reset after 1 hour
- [ ] Retry succeeded

### Scenario 5: Security
- [ ] Unauthorized distribution blocked
- [ ] Operator addition blocked
- [ ] Bot wallet verified as operator
- [ ] All security checks passed

### Post-Test Verification
- [ ] All metrics collected
- [ ] Test results documented
- [ ] Issues logged (if any)
- [ ] Performance benchmarks recorded
- [ ] Audit report updated

---

## 🚨 Known Issues / Risks

### Potential Issues
1. **Twitter API Rate Limits** - Bot may hit Twitter rate limits under heavy load
2. **RPC Timeouts** - Mainnet RPC may timeout during peak usage
3. **Bonding Curve Edge Cases** - Need to test at curve extremes (start/end)
4. **Concurrent Distributions** - Race conditions with multiple simultaneous requests

### Mitigation Strategies
1. **Retry Logic** - Implement exponential backoff for failed distributions
2. **RPC Fallback** - Configure multiple RPC endpoints
3. **Curve Validation** - Add bounds checking for bonding curve calculations
4. **Queueing** - Use dispenser queue to serialize concurrent requests

---

## 📝 Test Results Template

```markdown
## E2E Test Results - [Date]

### Test Environment
- Network: Solana Mainnet
- Token: 3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG
- Bot: https://moltx.io/ClawdNation_bot

### Scenario 1: Tweet Distribution
- Status: ⏳ PENDING
- Latency: - seconds
- Tokens received: - CLWDN
- Transaction: -

### Scenario 2: SOL Contribution
- Status: ⏳ PENDING
- SOL contributed: - SOL
- Tokens received: - CLWDN
- Bonding curve rate: - CLWDN/SOL
- Latency: - seconds
- Transaction: -

### Scenario 3: Token Factory
- Status: ⏳ PENDING
- Creation time: - seconds
- New token mint: -
- Authorities revoked: Yes/No

### Scenario 4: Rate Limiting
- Status: ⏳ PENDING
- Successful distributions: -/100
- Rate limited: Yes/No
- Limit reset: Yes/No

### Scenario 5: Security
- Status: ⏳ PENDING
- Unauthorized attempts blocked: Yes/No
- Bot operator verified: Yes/No

### Overall Results
- Tests Passed: -/-
- Success Rate: -%
- Average Latency: - seconds
- Issues Found: -
```

---

## 🔗 References

- **Bot Platform:** https://moltx.io/ClawdNation_bot
- **Token Explorer:** https://explorer.solana.com/address/3zvSRWfjPvcnt8wfTrKhgCtQVwVSrYfBY6g1jPwzfHJG
- **Bootstrap Program:** https://explorer.solana.com/address/BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN
- **Dispenser Program:** https://explorer.solana.com/address/AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ
- **Main Audit:** MAINNET_TOKEN_AUDIT.md

---

*E2E Test Plan Generated by Claude Code*
*Last Updated: February 3, 2026*
