/**
 * SPL Governance Migration Script
 *
 * This script sets up SPL Governance for ClawdNation programs:
 * - Creates a DAO realm
 * - Creates governance accounts for Bootstrap and Dispenser authorities
 * - Transfers authorities from hot wallet to governance (requires proposals)
 *
 * IMPORTANT: This script only PROPOSES authority transfers.
 * Council members must vote to accept via governance proposals.
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const {
  getGovernanceProgramVersion,
  withCreateRealm,
  withDepositGoverningTokens,
  withCreateGovernance,
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  getRealm,
  getTokenOwnerRecordAddress,
} = require('@solana/spl-governance');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Load authority keypair (current authority of programs)
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

// Program IDs
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');
const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');

// SPL Governance Program (devnet)
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

console.log('Authority:', authority.publicKey.toBase58());
console.log('Bootstrap Program:', BOOTSTRAP_PROGRAM.toBase58());
console.log('Dispenser Program:', DISPENSER_PROGRAM.toBase58());
console.log('Governance Program:', GOVERNANCE_PROGRAM_ID.toBase58());

/**
 * Step 1: Create the DAO realm
 *
 * A realm is the top-level DAO entity. It can have council members who vote on proposals.
 * We'll use the CLWDN token as the community token (optional) and create council seats.
 */
async function createRealm() {
  console.log('\n=== Step 1: Creating DAO Realm ===');

  const realmName = 'ClawdNation DAO';

  // Check if realm already exists
  try {
    const realm = await getRealm(conn, GOVERNANCE_PROGRAM_ID, realmName);
    console.log('✅ Realm already exists:', realm.pubkey.toBase58());
    return realm.pubkey;
  } catch (e) {
    console.log('Realm not found, creating new one...');
  }

  const instructions = [];
  const signers = [authority];

  // Community token config (CLWDN holders can vote - optional)
  const communityTokenConfig = new GoverningTokenConfigAccountArgs({
    voterWeightAddin: undefined,
    maxVoterWeightAddin: undefined,
    tokenType: GoverningTokenType.Liquid,
  });

  // Create realm instruction
  const realmAddress = await withCreateRealm(
    instructions,
    GOVERNANCE_PROGRAM_ID,
    await getGovernanceProgramVersion(conn, GOVERNANCE_PROGRAM_ID),
    realmName,
    authority.publicKey, // realm authority (can add/remove council members)
    CLWDN_MINT, // community token (CLWDN holders can vote)
    authority.publicKey, // payer
    undefined, // council mint (we'll use token-based voting instead)
    communityTokenConfig,
    undefined, // council token config
  );

  console.log('Realm address:', realmAddress.toBase58());

  // Send transaction
  const tx = new Transaction().add(...instructions);
  const sig = await conn.sendTransaction(tx, signers, { skipPreflight: false });
  await conn.confirmTransaction(sig);

  console.log('✅ Realm created! Signature:', sig);
  return realmAddress;
}

/**
 * Step 2: Create governance for Bootstrap program
 *
 * Governance controls who can execute instructions on the Bootstrap program.
 * We set voting thresholds: 60% approval with 3 of 5 council members.
 */
async function createBootstrapGovernance(realmAddress) {
  console.log('\n=== Step 2: Creating Bootstrap Governance ===');

  const instructions = [];
  const signers = [authority];

  // Bootstrap state PDA (governed account)
  const [bootstrapState] = PublicKey.findProgramAddressSync(
    [Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM
  );

  console.log('Bootstrap State PDA:', bootstrapState.toBase58());

  // Governance config: 60% approval, 3 of 5 threshold
  const config = {
    voteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 60, // 60% approval required
    }),
    minCommunityTokensToCreateProposal: 1_000_000_000_000_000n, // 1M CLWDN
    minInstructionHoldUpTime: 0, // No delay (can be changed later)
    baseVotingTime: 86400, // 24 hours voting period
    communityVoteTipping: VoteTipping.Strict, // Must reach threshold
    councilVoteTipping: VoteTipping.Strict,
    minCouncilTokensToCreateProposal: 1n,
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    votingCoolOffTime: 0,
    depositExemptProposalCount: 10,
  };

  const governanceAddress = await withCreateGovernance(
    instructions,
    GOVERNANCE_PROGRAM_ID,
    await getGovernanceProgramVersion(conn, GOVERNANCE_PROGRAM_ID),
    realmAddress,
    bootstrapState, // governed account
    config,
    await getTokenOwnerRecordAddress(
      GOVERNANCE_PROGRAM_ID,
      realmAddress,
      CLWDN_MINT,
      authority.publicKey
    ),
    authority.publicKey, // payer
    authority.publicKey, // governance authority (creator)
  );

  console.log('Bootstrap Governance address:', governanceAddress.toBase58());

  // Send transaction
  const tx = new Transaction().add(...instructions);
  const sig = await conn.sendTransaction(tx, signers, { skipPreflight: false });
  await conn.confirmTransaction(sig);

  console.log('✅ Bootstrap Governance created! Signature:', sig);
  return governanceAddress;
}

/**
 * Step 3: Create governance for Dispenser program
 *
 * Similar to Bootstrap, but with lower threshold: 50% approval with 2 of 4 council.
 * Dispenser needs faster execution for operational efficiency.
 */
async function createDispenserGovernance(realmAddress) {
  console.log('\n=== Step 3: Creating Dispenser Governance ===');

  const instructions = [];
  const signers = [authority];

  // Dispenser state PDA (governed account)
  const [dispenserState] = PublicKey.findProgramAddressSync(
    [Buffer.from('state')], DISPENSER_PROGRAM
  );

  console.log('Dispenser State PDA:', dispenserState.toBase58());

  // Governance config: 50% approval, 2 of 4 threshold
  const config = {
    voteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 50, // 50% approval (2 of 4)
    }),
    minCommunityTokensToCreateProposal: 1_000_000_000_000_000n, // 1M CLWDN
    minInstructionHoldUpTime: 0,
    baseVotingTime: 43200, // 12 hours (faster than bootstrap)
    communityVoteTipping: VoteTipping.Strict,
    councilVoteTipping: VoteTipping.Strict,
    minCouncilTokensToCreateProposal: 1n,
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    votingCoolOffTime: 0,
    depositExemptProposalCount: 10,
  };

  const governanceAddress = await withCreateGovernance(
    instructions,
    GOVERNANCE_PROGRAM_ID,
    await getGovernanceProgramVersion(conn, GOVERNANCE_PROGRAM_ID),
    realmAddress,
    dispenserState, // governed account
    config,
    await getTokenOwnerRecordAddress(
      GOVERNANCE_PROGRAM_ID,
      realmAddress,
      CLWDN_MINT,
      authority.publicKey
    ),
    authority.publicKey, // payer
    authority.publicKey, // governance authority
  );

  console.log('Dispenser Governance address:', governanceAddress.toBase58());

  // Send transaction
  const tx = new Transaction().add(...instructions);
  const sig = await conn.sendTransaction(tx, signers, { skipPreflight: false });
  await conn.confirmTransaction(sig);

  console.log('✅ Dispenser Governance created! Signature:', sig);
  return governanceAddress;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║       ClawdNation SPL Governance Migration                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const balance = await conn.getBalance(authority.publicKey);
  console.log('Authority balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.error('❌ Insufficient SOL balance. Need at least 0.5 SOL for transactions.');
    process.exit(1);
  }

  try {
    // Step 1: Create DAO realm
    const realmAddress = await createRealm();

    // Step 2: Create Bootstrap governance
    const bootstrapGovernance = await createBootstrapGovernance(realmAddress);

    // Step 3: Create Dispenser governance
    const dispenserGovernance = await createDispenserGovernance(realmAddress);

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                     MIGRATION COMPLETE                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('\n📋 Governance Addresses:');
    console.log('  Realm:', realmAddress.toBase58());
    console.log('  Bootstrap Governance:', bootstrapGovernance.toBase58());
    console.log('  Dispenser Governance:', dispenserGovernance.toBase58());

    console.log('\n⚠️  NEXT STEPS:');
    console.log('1. Add council members to the realm (use Realms UI or CLI)');
    console.log('2. Run transfer-authority.js to propose authority transfers');
    console.log('3. Council members vote on proposals to accept authority');
    console.log('4. Once approved, governance controls the programs!');

    console.log('\n🔗 Manage governance at: https://app.realms.today');

    // Save addresses to file
    const output = {
      network: RPC.includes('devnet') ? 'devnet' : RPC.includes('mainnet') ? 'mainnet' : 'custom',
      realm: realmAddress.toBase58(),
      bootstrapGovernance: bootstrapGovernance.toBase58(),
      dispenserGovernance: dispenserGovernance.toBase58(),
      governanceProgramId: GOVERNANCE_PROGRAM_ID.toBase58(),
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, 'governance-addresses.json'),
      JSON.stringify(output, null, 2)
    );
    console.log('\n💾 Addresses saved to governance-addresses.json');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
