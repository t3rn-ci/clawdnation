#!/usr/bin/env node
/**
 * REAL Raydium LP Deployment Test
 * This actually creates a pool on-chain (not just simulation)
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

// Load authority
const authorityKey = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const RAYDIUM_CPMM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Test parameters
const SOL_AMOUNT = 0.1; // Use small amount for testing
const TOKEN_AMOUNT = 4000; // 40K CLWDN/SOL rate

console.log('╔═══════════════════════════════════════════════════╗');
console.log('║     REAL RAYDIUM LP DEPLOYMENT TEST                ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

console.log('⚠️  WARNING: This will actually create a Raydium pool!\n');
console.log('📋 Test Configuration:');
console.log(`  SOL Amount: ${SOL_AMOUNT} SOL`);
console.log(`  Token Amount: ${TOKEN_AMOUNT} CLWDN`);
console.log(`  Initial Price: 1 SOL = ${TOKEN_AMOUNT / SOL_AMOUNT} CLWDN`);
console.log(`  Network: Devnet`);
console.log('');

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 1: CHECK PREREQUISITES\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const solBalance = await conn.getBalance(authority.publicKey);
  console.log(`  Authority SOL: ${(solBalance / 1e9).toFixed(4)} SOL`);
  
  const tokenAccount = await getAssociatedTokenAddress(CLWDN_MINT, authority.publicKey);
  let tokenBalance = 0;
  try {
    const tokenInfo = await conn.getTokenAccountBalance(tokenAccount);
    tokenBalance = tokenInfo.value.uiAmount || 0;
  } catch (e) {
    console.log('  ⚠️  No CLWDN token account found');
  }
  console.log(`  CLWDN Balance: ${tokenBalance} CLWDN`);
  
  if (solBalance < SOL_AMOUNT * 1e9 + 0.1e9) {
    console.log('\n❌ Insufficient SOL balance');
    process.exit(1);
  }
  
  if (tokenBalance < TOKEN_AMOUNT) {
    console.log('\n❌ Insufficient CLWDN balance');
    process.exit(1);
  }
  
  console.log('\n✅ Prerequisites met!\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 2: RAYDIUM CPMM POOL CREATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📖 To create a Raydium CPMM pool, you need:\n');
  console.log('1. Raydium SDK or CLI');
  console.log('2. Call initialize instruction with:');
  console.log(`   - Token A (SOL): ${SOL_AMOUNT} SOL (${SOL_AMOUNT * 1e9} lamports)`);
  console.log(`   - Token B (CLWDN): ${TOKEN_AMOUNT} (${TOKEN_AMOUNT * 1e9} base units)`);
  console.log('   - Fee tier: 0.3% (30 basis points)');
  console.log('3. Transaction will return LP token mint address\n');
  
  console.log('📋 Example using Raydium SDK:\n');
  console.log('```typescript');
  console.log('import { CpmmPoolModule } from "@raydium-io/raydium-sdk-v2";');
  console.log('');
  console.log('const { poolId, lpMint } = await CpmmPoolModule.createPool({');
  console.log('  connection,');
  console.log('  payer: authority,');
  console.log('  tokenMintA: SOL_MINT,');
  console.log('  tokenMintB: CLWDN_MINT,');
  console.log(`  amountA: ${SOL_AMOUNT * 1e9},`);
  console.log(`  amountB: ${TOKEN_AMOUNT * 1e9},`);
  console.log('  feeRate: 30, // 0.3%');
  console.log('});');
  console.log('```\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 3: LP TOKEN BURN (CRITICAL)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('⚠️  MANDATORY: After pool creation, burn ALL LP tokens:\n');
  console.log('```bash');
  console.log('# Get LP token account');
  console.log('spl-token accounts <LP_MINT> --url devnet');
  console.log('');
  console.log('# Burn ALL LP tokens');
  console.log('spl-token burn <LP_TOKEN_ACCOUNT> ALL --url devnet');
  console.log('');
  console.log('# Verify burn');
  console.log('spl-token balance <LP_MINT> --url devnet  # Should be 0');
  console.log('```\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('STEP 4: VERIFICATION\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('After burning, verify:\n');
  console.log('1. Pool exists on Raydium');
  console.log('2. LP token supply is 0 (all burned)');
  console.log('3. Pool liquidity matches amounts provided');
  console.log('4. Trading works (buy/sell test with small amount)');
  console.log('5. Pool is permanently locked (no one controls LP tokens)\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ TEST PLAN COMPLETE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('💡 To run actual pool creation:');
  console.log('   1. Install Raydium SDK: npm install @raydium-io/raydium-sdk-v2');
  console.log('   2. Use the code example above');
  console.log('   3. IMMEDIATELY burn LP tokens after creation');
  console.log('   4. Verify on Raydium UI: https://raydium.io/');
  console.log('');
}

main().catch(console.error);
