const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const fs = require('fs');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const authorityKey = JSON.parse(fs.readFileSync('/root/.config/solana/clawdnation.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

const CLWDN_MINT = new PublicKey('2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3');
const BOOTSTRAP_PROGRAM = new PublicKey('BFjy6b7KErhnVyep9xZL4yiuFK5hGTUJ7nH9Gkyw5HNN');
const DISPENSER_PROGRAM = new PublicKey('AaTxVzmKS4KQyupRAbPWfL3Z8JqPQuLT5B9uS1NfjdyZ');
const [BOOTSTRAP_STATE] = PublicKey.findProgramAddressSync([Buffer.from('bootstrap')], BOOTSTRAP_PROGRAM);
const [DISPENSER_STATE] = PublicKey.findProgramAddressSync([Buffer.from('state')], DISPENSER_PROGRAM);

const EX = 'https://explorer.solana.com';

function anchorDisc(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

function txLink(sig) { return `${EX}/tx/${sig}?cluster=devnet`; }
function addrLink(addr) { return `${EX}/address/${addr}?cluster=devnet`; }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const results = { txs: {}, accounts: {}, steps: [] };

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     CLWDN E2E TEST — Full Bootstrap → Dispense  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // === STEP 0: Setup ===
  console.log('━━━ STEP 0: Setup ━━━');
  const buyer = Keypair.generate();
  console.log(`Buyer wallet: ${buyer.publicKey.toBase58()}`);
  console.log(`  Explorer: ${addrLink(buyer.publicKey.toBase58())}`);
  
  const fundTx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey, toPubkey: buyer.publicKey, lamports: 0.2 * LAMPORTS_PER_SOL
  }));
  const fundSig = await sendAndConfirmTransaction(conn, fundTx, [authority]);
  
  const buyerBal = await conn.getBalance(buyer.publicKey);
  console.log(`Fund TX: ${fundSig}`);
  console.log(`  Explorer: ${txLink(fundSig)}`);
  console.log(`Buyer SOL balance: ${buyerBal / LAMPORTS_PER_SOL}`);
  results.txs.fund = fundSig;
  results.accounts.buyer = buyer.publicKey.toBase58();
  
  const treasuryBalBefore = await conn.getBalance(authority.publicKey);
  console.log(`Treasury SOL before: ${treasuryBalBefore / LAMPORTS_PER_SOL}`);
  results.steps.push({ step: 0, status: '✅', desc: 'Buyer funded', tx: fundSig });
  console.log();

  // === STEP 1: X Post Intent (simulated) ===
  console.log('━━━ STEP 1: X Post Intent ━━━');
  console.log('Simulated tweet: "@clawdnation I want to buy $CLWDN!"');
  console.log('Bot replies: "Send SOL to our bootstrap program to get CLWDN at 1 SOL = 10,000 CLWDN"');
  console.log(`Bootstrap program: ${BOOTSTRAP_PROGRAM.toBase58()}`);
  console.log(`  Explorer: ${addrLink(BOOTSTRAP_PROGRAM.toBase58())}`);
  results.steps.push({ step: 1, status: '✅', desc: 'X post intent (simulated)' });
  console.log();

  // === STEP 2: Contribute SOL to Bootstrap ===
  console.log('━━━ STEP 2: Contribute SOL to Bootstrap ━━━');
  const contributionLamports = 0.1 * LAMPORTS_PER_SOL;
  const expectedClwdn = 1000;

  const [contributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('contributor'), buyer.publicKey.toBuffer()], BOOTSTRAP_PROGRAM
  );
  console.log(`Contributor PDA: ${contributorPda.toBase58()}`);
  console.log(`  Explorer: ${addrLink(contributorPda.toBase58())}`);
  results.accounts.contributorPda = contributorPda.toBase58();

  const contribDisc = anchorDisc('contribute_sol');
  const contribData = Buffer.alloc(8 + 8);
  contribDisc.copy(contribData, 0);
  contribData.writeBigUInt64LE(BigInt(Math.round(contributionLamports)), 8);

  const contribIx = new TransactionInstruction({
    programId: BOOTSTRAP_PROGRAM,
    keys: [
      { pubkey: BOOTSTRAP_STATE, isSigner: false, isWritable: true },
      { pubkey: contributorPda, isSigner: false, isWritable: true },
      { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: contribData,
  });

  const contribTx = new Transaction().add(contribIx);
  const contribSig = await sendAndConfirmTransaction(conn, contribTx, [buyer]);
  console.log(`✅ Contribution TX: ${contribSig}`);
  console.log(`  Explorer: ${txLink(contribSig)}`);
  console.log(`  Amount: 0.1 SOL → expected ${expectedClwdn} CLWDN`);
  results.txs.contribution = contribSig;

  // Verify contribution on-chain
  const contributorAcct = await conn.getAccountInfo(contributorPda);
  if (contributorAcct) {
    const data = contributorAcct.data;
    const totalLamports = data.readBigUInt64LE(40);
    const totalClwdn = data.readBigUInt64LE(48);
    const count = data.readBigUInt64LE(56);
    const distributed = data[72] === 1;
    console.log('  On-chain record:');
    console.log(`    Total contributed: ${Number(totalLamports) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    Total allocated: ${Number(totalClwdn) / 1e9} CLWDN`);
    console.log(`    Contributions: ${Number(count)}`);
    console.log(`    Distributed: ${distributed}`);
  }

  const treasuryBalAfter = await conn.getBalance(authority.publicKey);
  console.log(`  Treasury SOL after: ${treasuryBalAfter / LAMPORTS_PER_SOL}`);
  console.log(`  SOL received by treasury: ${(treasuryBalAfter - treasuryBalBefore) / LAMPORTS_PER_SOL}`);
  results.steps.push({ step: 2, status: '✅', desc: 'Bootstrap contribution (0.1 SOL → 1000 CLWDN)', tx: contribSig });
  console.log();

  // === STEP 3: Wait for Dispenser ===
  console.log('━━━ STEP 3: Waiting for Dispenser Service ━━━');
  console.log('Dispenser polls every 15s. Waiting up to 60s...');
  
  const buyerAta = await getAssociatedTokenAddress(CLWDN_MINT, buyer.publicKey, false, TOKEN_PROGRAM_ID);
  console.log(`Buyer ATA: ${buyerAta.toBase58()}`);
  console.log(`  Explorer: ${addrLink(buyerAta.toBase58())}`);
  results.accounts.buyerAta = buyerAta.toBase58();
  
  let distributed = false;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    process.stdout.write(`  ${(i+1)*5}s... `);
    
    try {
      const tokenAcct = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
      if (tokenAcct.amount > 0n) {
        console.log(`CLWDN received! Balance: ${Number(tokenAcct.amount) / 1e9} CLWDN`);
        distributed = true;
        break;
      }
    } catch {
      // Token account doesn't exist yet
    }
    
    const record = await conn.getAccountInfo(contributorPda);
    if (record && record.data[72] === 1) {
      console.log('Marked as distributed on bootstrap!');
      distributed = true;
      await sleep(3000);
      try {
        const tokenAcct = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
        console.log(`  Buyer CLWDN balance: ${Number(tokenAcct.amount) / 1e9}`);
      } catch {
        console.log('  Token account not yet created (may need a moment)');
      }
      break;
    }
    console.log('waiting...');
  }
  
  results.steps.push({ step: 3, status: distributed ? '✅' : '❌', desc: 'Dispenser auto-distribution' });
  console.log();

  // === STEP 4: Final Verification ===
  console.log('━━━ STEP 4: Final Verification ━━━');
  
  // Buyer CLWDN balance
  let finalClwdn = 0;
  try {
    const tokenAcct = await getAccount(conn, buyerAta, 'confirmed', TOKEN_PROGRAM_ID);
    finalClwdn = Number(tokenAcct.amount) / 1e9;
    console.log(`${finalClwdn >= expectedClwdn ? '✅' : '❌'} Buyer CLWDN balance: ${finalClwdn} CLWDN (expected: ${expectedClwdn})`);
  } catch {
    console.log('❌ Buyer has no CLWDN token account');
  }

  // Contributor record
  const finalRecord = await conn.getAccountInfo(contributorPda);
  if (finalRecord) {
    const isDist = finalRecord.data[72] === 1;
    console.log(`${isDist ? '✅' : '❌'} Contributor record: ${isDist ? 'DISTRIBUTED' : 'PENDING'}`);
  }

  // Dispenser state — parse carefully
  const dispenserAcct = await conn.getAccountInfo(DISPENSER_STATE);
  if (dispenserAcct) {
    try {
      // DispenserState layout:
      // 8 disc + 32 mint + 32 authority + 1 option_tag + (32 if Some) pending_authority + 4 vec_len + N*32 operators + 8 total_distributed + 8 total_queued + 8 total_cancelled + 1 bump
      const data = dispenserAcct.data;
      let offset = 8; // skip discriminator
      offset += 32; // mint
      offset += 32; // authority
      const hasPending = data[offset]; offset += 1;
      if (hasPending) offset += 32; // pending_authority pubkey
      const vecLen = data.readUInt32LE(offset); offset += 4;
      offset += vecLen * 32; // operators
      const totalDistributed = data.readBigUInt64LE(offset); offset += 8;
      const totalQueued = data.readBigUInt64LE(offset); offset += 8;
      const totalCancelled = data.readBigUInt64LE(offset); offset += 8;
      console.log(`  Dispenser total_distributed: ${Number(totalDistributed) / 1e9} CLWDN`);
      console.log(`  Dispenser total_queued: ${Number(totalQueued) / 1e9} CLWDN`);
      console.log(`  Dispenser total_cancelled: ${Number(totalCancelled) / 1e9} CLWDN`);
    } catch (e) {
      console.log(`  Dispenser state parse error: ${e.message}`);
    }
  }

  // Vault balance
  const vaultAta = await getAssociatedTokenAddress(CLWDN_MINT, DISPENSER_STATE, true, TOKEN_PROGRAM_ID);
  try {
    const vaultAcct = await getAccount(conn, vaultAta, 'confirmed', TOKEN_PROGRAM_ID);
    console.log(`  Vault remaining: ${Number(vaultAcct.amount) / 1e9} CLWDN`);
  } catch {}

  // Get dispenser service logs for this buyer
  console.log();
  console.log('━━━ Dispenser Service Logs (for this buyer) ━━━');
  // We'll print the contribution ID the dispenser would use
  const contribCount = contributorAcct ? Number(contributorAcct.data.readBigUInt64LE(56)) : 1;
  const dispenserContribId = `bootstrap-${buyer.publicKey.toBase58().slice(0, 16)}-${contribCount}`;
  console.log(`Expected contribution ID: ${dispenserContribId}`);
  const [distPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('dist'), Buffer.from(dispenserContribId)], DISPENSER_PROGRAM
  );
  console.log(`Distribution PDA: ${distPda.toBase58()}`);
  console.log(`  Explorer: ${addrLink(distPda.toBase58())}`);
  results.accounts.distPda = distPda.toBase58();

  // Check distribution PDA
  const distAcct = await conn.getAccountInfo(distPda);
  if (distAcct) {
    try {
      const data = distAcct.data;
      let off = 8; // disc
      const strLen = data.readUInt32LE(off); off += 4;
      const contId = data.slice(off, off + strLen).toString('utf8'); off = 8 + 4 + 64; // skip to after max_len string
      const recipient = new PublicKey(data.slice(off, off + 32)); off += 32;
      const amount = data.readBigUInt64LE(off); off += 8;
      const status = data[off]; off += 1;
      const queuedAt = Number(data.readBigInt64LE(off)); off += 8;
      const distributedAt = Number(data.readBigInt64LE(off)); off += 8;
      console.log(`  contribution_id: ${contId}`);
      console.log(`  recipient: ${recipient.toBase58()}`);
      console.log(`  amount: ${Number(amount) / 1e9} CLWDN`);
      console.log(`  status: ${status === 0 ? 'Queued' : status === 1 ? 'Distributed' : 'Cancelled'}`);
      console.log(`  queued_at: ${new Date(queuedAt * 1000).toISOString()}`);
      if (distributedAt > 0) console.log(`  distributed_at: ${new Date(distributedAt * 1000).toISOString()}`);
    } catch (e) {
      console.log(`  Distribution PDA parse error: ${e.message}`);
    }
  } else {
    console.log('  Distribution PDA not found (dispenser may not have processed yet)');
  }

  // === Final Summary ===
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                  SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log('📋 Accounts:');
  console.log(`  Buyer:          ${buyer.publicKey.toBase58()}`);
  console.log(`                  ${addrLink(buyer.publicKey.toBase58())}`);
  console.log(`  Contributor PDA: ${contributorPda.toBase58()}`);
  console.log(`                  ${addrLink(contributorPda.toBase58())}`);
  console.log(`  Buyer ATA:      ${buyerAta.toBase58()}`);
  console.log(`                  ${addrLink(buyerAta.toBase58())}`);
  if (distAcct) {
    console.log(`  Distribution PDA: ${distPda.toBase58()}`);
    console.log(`                  ${addrLink(distPda.toBase58())}`);
  }
  console.log();
  console.log('📝 Transactions:');
  console.log(`  1. Fund buyer (0.2 SOL):        ${fundSig}`);
  console.log(`     ${txLink(fundSig)}`);
  console.log(`  2. Bootstrap contribute (0.1 SOL): ${contribSig}`);
  console.log(`     ${txLink(contribSig)}`);
  console.log();
  console.log('📊 Result:');
  for (const s of results.steps) {
    console.log(`  ${s.status} Step ${s.step}: ${s.desc}${s.tx ? ' — TX: ' + s.tx.slice(0, 20) + '...' : ''}`);
  }
  console.log();
  console.log(distributed && finalClwdn >= expectedClwdn
    ? '✅ E2E TEST PASSED — Full flow verified on-chain'
    : '❌ E2E TEST FAILED — Check dispenser service: journalctl -u clawdnation-dispenser -n 50');
}

main().catch(e => { console.error(e); process.exit(1); });
