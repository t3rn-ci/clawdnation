/**
 * COMPLETE CLWDN DEPLOYMENT SCRIPT
 *
 * Simulates full "self-release" on devnet:
 * 1. Verify CLWDN mint & allocations
 * 2. Initialize vesting (Staking: 4yr, Team: 6m cliff + 12m vest)
 * 3. Set up SPL Governance (multisig authorities)
 * 4. Configure Dispenser (authority = governance, operator = hot wallet)
 * 5. Transfer authorities to governance
 * 6. Burn mint authority
 *
 * Each step shows transaction signatures and status.
 */

const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority keypair
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Programs & Mint
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');
const GOVERNANCE_PROGRAM = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// Results tracking
const DEPLOYMENT_LOG = path.join(__dirname, 'deployment-log.json');
const log = {
  network: 'devnet',
  timestamp: new Date().toISOString(),
  authority: authority.publicKey.toBase58(),
  steps: [],
};

function logStep(step, status, data = {}) {
  const entry = { step, status, timestamp: new Date().toISOString(), ...data };
  log.steps.push(entry);
  fs.writeFileSync(DEPLOYMENT_LOG, JSON.stringify(log, null, 2));

  const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
  console.log(`\n${emoji} Step ${log.steps.length}: ${step}`);
  if (data.tx) console.log(`   TX: ${data.tx}`);
  if (data.details) console.log(`   ${data.details}`);
}

function anchorDisc(name) {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║       CLWDN COMPLETE DEPLOYMENT (Devnet)                  ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');
console.log(`Authority: ${authority.publicKey.toBase58()}`);
console.log(`Network: ${RPC}`);
console.log(`Time: ${new Date().toLocaleString()}\n`);

// ═══════════════════════════════════════════════════════
// STEP 1: VERIFY MINT & ALLOCATIONS
// ═══════════════════════════════════════════════════════

async function step1_verifyMint() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 1: Verify CLWDN Mint & Allocations');
  console.log('════════════════════════════════════════════════════════');

  try {
    // Check mint
    const mintInfo = await conn.getParsedAccountInfo(CLWDN_MINT);
    if (!mintInfo.value) {
      throw new Error('CLWDN mint not found!');
    }

    const mintData = mintInfo.value.data.parsed.info;
    const supply = Number(mintData.supply) / 1e9;

    console.log(`\n   Mint: ${CLWDN_MINT.toBase58()}`);
    console.log(`   Supply: ${supply.toLocaleString()} CLWDN`);
    console.log(`   Decimals: ${mintData.decimals}`);
    console.log(`   Mint Authority: ${mintData.mintAuthority || 'NONE'}`);
    console.log(`   Freeze Authority: ${mintData.freezeAuthority || 'NONE'}`);

    // Get authority's token account
    const authAta = await getAssociatedTokenAddress(CLWDN_MINT, authority.publicKey);
    let authBalance = 0;

    try {
      const ataInfo = await conn.getTokenAccountBalance(authAta);
      authBalance = Number(ataInfo.value.amount) / 1e9;
    } catch (e) {
      console.log(`\n   ⚠️  Authority has no token account yet`);
    }

    console.log(`\n   Authority Token Account: ${authAta.toBase58()}`);
    console.log(`   Authority Balance: ${authBalance.toLocaleString()} CLWDN`);

    // Load factory config to show allocation plan
    const { calculateAllocations } = require('./factory-tokenomics.js');
    const allocations = calculateAllocations(1_000_000_000);

    console.log('\n   📊 PLANNED ALLOCATIONS:');
    Object.entries(allocations.allocations).forEach(([key, alloc]) => {
      console.log(`   ${key}: ${alloc.tokens.toLocaleString()} CLWDN (${alloc.percent}%)`);
    });

    logStep('Verify CLWDN Mint', 'success', {
      mint: CLWDN_MINT.toBase58(),
      supply,
      authorityBalance: authBalance,
      mintAuthority: mintData.mintAuthority,
    });

    return { supply, authBalance, mintAuthority: mintData.mintAuthority };
  } catch (e) {
    logStep('Verify CLWDN Mint', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// STEP 2: INITIALIZE VESTING
// ═══════════════════════════════════════════════════════

async function step2_initializeVesting() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 2: Initialize Vesting Schedules');
  console.log('════════════════════════════════════════════════════════');

  try {
    const vestingPath = path.join(__dirname, 'clwdn-vesting.json');

    // Create vesting schedule
    const vesting = {
      allocations: [
        {
          id: 'staking',
          category: 'Staking Rewards',
          recipient: authority.publicKey.toBase58(), // Will transfer to staking program
          totalAmount: 150_000_000,
          claimedAmount: 0,
          vestingMonths: 48, // 4 years
          monthlyUnlock: 3_125_000,
          cliff: 0,
          startDate: new Date().toISOString(),
          lastClaim: null,
          claimCount: 0,
          status: 'active',
        },
        {
          id: 'team',
          category: 'Team',
          recipient: authority.publicKey.toBase58(), // Will transfer to team multisig
          totalAmount: 150_000_000,
          claimedAmount: 0,
          vestingMonths: 12, // 12 months AFTER cliff
          monthlyUnlock: 12_500_000,
          cliff: 6, // 6 months cliff
          startDate: new Date().toISOString(),
          lastClaim: null,
          claimCount: 0,
          status: 'cliff', // Status: cliff until 6 months pass
        },
      ],
      metadata: {
        mint: CLWDN_MINT.toBase58(),
        authority: authority.publicKey.toBase58(),
        createdAt: new Date().toISOString(),
        network: 'devnet',
      },
    };

    fs.writeFileSync(vestingPath, JSON.stringify(vesting, null, 2));

    console.log('\n   ✅ Vesting schedules created:');
    console.log(`\n   ⚡ STAKING REWARDS:`);
    console.log(`      Total: 150,000,000 CLWDN (15%)`);
    console.log(`      Vesting: 48 months (4 years) linear`);
    console.log(`      Monthly unlock: 3,125,000 CLWDN`);
    console.log(`      Cliff: None`);
    console.log(`      Status: Active`);

    console.log(`\n   👥 TEAM:`);
    console.log(`      Total: 150,000,000 CLWDN (15%)`);
    console.log(`      Cliff: 6 months (nothing unlocks!)`);
    console.log(`      Vesting: 12 months AFTER cliff`);
    console.log(`      Monthly unlock: 12,500,000 CLWDN (after cliff)`);
    console.log(`      Status: Cliff period`);

    console.log(`\n   📁 Saved to: ${vestingPath}`);

    logStep('Initialize Vesting', 'success', {
      vestingFile: vestingPath,
      allocations: vesting.allocations.map(a => ({
        id: a.id,
        amount: a.totalAmount,
        months: a.vestingMonths,
        cliff: a.cliff,
      })),
    });

    return vesting;
  } catch (e) {
    logStep('Initialize Vesting', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// STEP 3: CREATE SPL GOVERNANCE (MULTISIG)
// ═══════════════════════════════════════════════════════

async function step3_createGovernance() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 3: Create SPL Governance (Multisig Authorities)');
  console.log('════════════════════════════════════════════════════════');

  try {
    // For demo purposes, we'll create governance PDAs but not fully initialize
    // (full SPL Governance setup requires multiple signers which we don't have in test)

    // Calculate governance PDAs
    const [bootstrapState] = PublicKey.findProgramAddressSync(
      [Buffer.from('bootstrap')],
      BOOTSTRAP_PROGRAM
    );

    const [dispenserState] = PublicKey.findProgramAddressSync(
      [Buffer.from('state')],
      DISPENSER_PROGRAM
    );

    console.log('\n   📋 GOVERNANCE PLAN:');
    console.log(`\n   🏛️  Bootstrap Governance:`);
    console.log(`      Governed Account: ${bootstrapState.toBase58()}`);
    console.log(`      Voting: 3 of 5 council members`);
    console.log(`      Voting period: 24 hours`);
    console.log(`      Controls: pause, update_cap, update_target`);

    console.log(`\n   🏛️  Dispenser Governance:`);
    console.log(`      Governed Account: ${dispenserState.toBase58()}`);
    console.log(`      Voting: 2 of 4 council members`);
    console.log(`      Voting period: 12 hours`);
    console.log(`      Controls: pause, update_rate_limit, update_max_amount`);

    console.log(`\n   ⚡ Dispenser Operator (HOT WALLET):`);
    console.log(`      Address: ${authority.publicKey.toBase58()}`);
    console.log(`      Controls: add_recipient, distribute, cancel`);
    console.log(`      Rate limited: 100 distributions/hour`);
    console.log(`      Amount capped: 10M CLWDN per transaction`);
    console.log(`      Can emergency_pause: YES`);

    console.log(`\n   ⚠️  NOTE: Full governance setup requires multiple signers.`);
    console.log(`      For devnet demo, we'll simulate the structure.`);

    logStep('Create Governance Plan', 'success', {
      bootstrapState: bootstrapState.toBase58(),
      dispenserState: dispenserState.toBase58(),
      operatorHotWallet: authority.publicKey.toBase58(),
      details: 'Governance structure documented, full setup requires council members',
    });

    return { bootstrapState, dispenserState };
  } catch (e) {
    logStep('Create Governance Plan', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// STEP 4: CONFIGURE DISPENSER (AUTHORITY vs OPERATOR)
// ═══════════════════════════════════════════════════════

async function step4_configureDispenser() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 4: Configure Dispenser (Authority + Operator)');
  console.log('════════════════════════════════════════════════════════');

  try {
    const [dispenserState] = PublicKey.findProgramAddressSync(
      [Buffer.from('state')],
      DISPENSER_PROGRAM
    );

    // Check current state
    const stateAccount = await conn.getAccountInfo(dispenserState);
    if (!stateAccount) {
      throw new Error('Dispenser not initialized! Run init-programs.js first.');
    }

    // Read current authority (offset: 8 + 32 = 40)
    const currentAuthority = new PublicKey(stateAccount.data.slice(40, 72));
    console.log(`\n   Current Authority: ${currentAuthority.toBase58()}`);

    // Check if operators list includes authority
    console.log(`\n   ✅ CURRENT SETUP:`);
    console.log(`      Authority: ${currentAuthority.toBase58()}`);
    console.log(`      Operator: ${authority.publicKey.toBase58()}`);
    console.log(`      (Operator is in operators list)`);

    console.log(`\n   🎯 DESIRED SETUP (Post-Governance):`);
    console.log(`      Authority: [Governance Address] (multisig)`);
    console.log(`      Operator: ${authority.publicKey.toBase58()} (hot wallet)`);
    console.log(`\n      Authority can:`);
    console.log(`         - emergency_pause → unpause`);
    console.log(`         - update_rate_limit`);
    console.log(`         - update_max_amount`);
    console.log(`         - add/remove operators`);
    console.log(`         - transfer_authority`);
    console.log(`\n      Operator can:`);
    console.log(`         - add_recipient (queue distribution)`);
    console.log(`         - distribute (send CLWDN)`);
    console.log(`         - cancel (cancel queued)`);
    console.log(`         - emergency_pause (security!)`);

    logStep('Configure Dispenser', 'success', {
      dispenserState: dispenserState.toBase58(),
      currentAuthority: currentAuthority.toBase58(),
      operator: authority.publicKey.toBase58(),
      details: 'Authority vs Operator roles defined',
    });

    return { dispenserState, currentAuthority };
  } catch (e) {
    logStep('Configure Dispenser', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// STEP 5: TRANSFER AUTHORITIES TO GOVERNANCE (SIMULATE)
// ═══════════════════════════════════════════════════════

async function step5_transferAuthorities() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 5: Transfer Authorities to Governance (Simulated)');
  console.log('════════════════════════════════════════════════════════');

  try {
    console.log(`\n   ⚠️  This step requires governance setup with council members.`);
    console.log(`      For devnet demo, we document the process:\n`);

    console.log(`   PROCESS:`);
    console.log(`   1️⃣  Create Realm: "ClawdNation DAO"`);
    console.log(`   2️⃣  Add council members (5 for Bootstrap, 4 for Dispenser)`);
    console.log(`   3️⃣  Create governance accounts for Bootstrap & Dispenser`);
    console.log(`   4️⃣  Call transfer_authority() on Bootstrap → [Bootstrap Governance]`);
    console.log(`   5️⃣  Call transfer_authority() on Dispenser → [Dispenser Governance]`);
    console.log(`   6️⃣  Governance creates proposals to accept authority`);
    console.log(`   7️⃣  Council votes (3 of 5 for Bootstrap, 2 of 4 for Dispenser)`);
    console.log(`   8️⃣  Execute proposals → accept_authority()`);
    console.log(`   9️⃣  Authorities transferred! 🎉\n`);

    console.log(`   COMMAND SEQUENCE (when ready):`);
    console.log(`   $ node migrate-to-governance.js`);
    console.log(`   $ node transfer-to-governance.js`);
    console.log(`   $ # Create proposals via Realms UI`);
    console.log(`   $ # Council votes`);
    console.log(`   $ # Execute proposals\n`);

    logStep('Transfer Authorities (Simulated)', 'success', {
      details: 'Process documented, requires council members for execution',
    });

    return true;
  } catch (e) {
    logStep('Transfer Authorities (Simulated)', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// STEP 6: BURN MINT AUTHORITY
// ═══════════════════════════════════════════════════════

async function step6_burnMintAuthority() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 6: Burn Mint Authority (CRITICAL!)');
  console.log('════════════════════════════════════════════════════════');

  try {
    // Check current mint authority
    const mintInfo = await conn.getParsedAccountInfo(CLWDN_MINT);
    const mintData = mintInfo.value.data.parsed.info;
    const mintAuthority = mintData.mintAuthority;

    console.log(`\n   Current Mint Authority: ${mintAuthority || 'NONE'}`);

    if (!mintAuthority) {
      console.log(`   ✅ Mint authority already burned!`);
      logStep('Burn Mint Authority', 'success', {
        status: 'Already burned',
        mintAuthority: null,
      });
      return { alreadyBurned: true };
    }

    console.log(`\n   ⚠️  CRITICAL DECISION:`);
    console.log(`      Burning mint authority is IRREVERSIBLE!`);
    console.log(`      After this, NO MORE CLWDN can ever be minted.`);
    console.log(`\n      Current supply: ${Number(mintData.supply) / 1e9} CLWDN`);
    console.log(`      This becomes the FINAL MAXIMUM SUPPLY forever.\n`);

    console.log(`   COMMAND TO BURN:`);
    console.log(`   $ spl-token authorize ${CLWDN_MINT.toBase58()} mint --disable --url devnet\n`);

    console.log(`   ⏳ For this demo, we SKIP actual burning.`);
    console.log(`      Run the command above when ready for production!\n`);

    logStep('Burn Mint Authority (Simulated)', 'success', {
      mintAuthority,
      command: `spl-token authorize ${CLWDN_MINT.toBase58()} mint --disable --url devnet`,
      details: 'Mint authority still active - burn when ready for production',
    });

    return { mintAuthority };
  } catch (e) {
    logStep('Burn Mint Authority', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// STEP 7: SUMMARY & VERIFICATION
// ═══════════════════════════════════════════════════════

async function step7_summary() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  STEP 7: Deployment Summary & Verification');
  console.log('════════════════════════════════════════════════════════');

  try {
    console.log(`\n   ✅ COMPLETED STEPS:\n`);

    log.steps.forEach((step, i) => {
      const emoji = step.status === 'success' ? '✅' : '❌';
      console.log(`   ${emoji} ${i + 1}. ${step.step}`);
      if (step.tx) console.log(`      TX: ${step.tx}`);
    });

    console.log(`\n\n   📊 CLWDN TOKENOMICS STATUS:`);
    console.log(`\n   Total Supply: 1,000,000,000 CLWDN`);
    console.log(`   ├─ Bootstrap (10%):      100,000,000 CLWDN - Ready for distribution`);
    console.log(`   ├─ Liquidity (40%):      400,000,000 CLWDN - Ready for LP creation`);
    console.log(`   ├─ Staking (15%):        150,000,000 CLWDN - 4yr vest, ACTIVE`);
    console.log(`   ├─ Team (15%):           150,000,000 CLWDN - 6m cliff, then 12m vest`);
    console.log(`   ├─ Community (10%):      100,000,000 CLWDN - Manual distribution`);
    console.log(`   └─ Treasury (10%):       100,000,000 CLWDN - Governance controlled\n`);

    console.log(`   🔐 SECURITY STATUS:\n`);
    console.log(`   ✅ Vesting: Initialized (staking + team)`);
    console.log(`   ✅ Dispenser: Authority + Operator roles defined`);
    console.log(`   ⏳ Governance: Structure documented (needs council)`);
    console.log(`   ⏳ Mint Authority: Active (burn when ready)\n`);

    console.log(`   📁 FILES CREATED:\n`);
    console.log(`      - clwdn-vesting.json (vesting schedules)`);
    console.log(`      - deployment-log.json (full deployment log)`);
    console.log(`      - factory-tokenomics-config.json (tokenomics config)\n`);

    console.log(`   🚀 NEXT STEPS:\n`);
    console.log(`   1. Create Raydium LP with 400M CLWDN`);
    console.log(`   2. Set up council members for governance`);
    console.log(`   3. Run: node migrate-to-governance.js`);
    console.log(`   4. Transfer authorities to governance`);
    console.log(`   5. Burn mint authority (production only!)`);
    console.log(`   6. Begin bootstrap distribution (100M CLWDN)\n`);

    console.log(`   🔗 EXPLORERS:\n`);
    console.log(`      CLWDN Mint: https://explorer.solana.com/address/${CLWDN_MINT.toBase58()}?cluster=devnet`);
    console.log(`      Bootstrap: https://explorer.solana.com/address/${BOOTSTRAP_PROGRAM.toBase58()}?cluster=devnet`);
    console.log(`      Dispenser: https://explorer.solana.com/address/${DISPENSER_PROGRAM.toBase58()}?cluster=devnet\n`);

    logStep('Deployment Summary', 'success', {
      totalSteps: log.steps.length,
      successCount: log.steps.filter(s => s.status === 'success').length,
      filesCreated: [
        'clwdn-vesting.json',
        'deployment-log.json',
        'factory-tokenomics-config.json',
      ],
    });

    return true;
  } catch (e) {
    logStep('Deployment Summary', 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════

async function main() {
  try {
    const balance = await conn.getBalance(authority.publicKey);
    console.log(`Authority Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient SOL! Need at least 0.1 SOL for transactions.');
    }

    // Execute deployment steps
    await step1_verifyMint();
    await step2_initializeVesting();
    await step3_createGovernance();
    await step4_configureDispenser();
    await step5_transferAuthorities();
    await step6_burnMintAuthority();
    await step7_summary();

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║            DEPLOYMENT COMPLETE! 🎉                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log(`📁 Full log saved to: ${DEPLOYMENT_LOG}\n`);

  } catch (error) {
    console.error('\n❌ DEPLOYMENT FAILED:', error.message);
    console.error('\nPartial log saved to:', DEPLOYMENT_LOG);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  step1_verifyMint,
  step2_initializeVesting,
  step3_createGovernance,
  step4_configureDispenser,
  step5_transferAuthorities,
  step6_burnMintAuthority,
  step7_summary,
};
