require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const NETWORK = process.env.NETWORK || 'mainnet';
const RPC = process.env.SOLANA_RPC;
const BOOTSTRAP_PROGRAM = new PublicKey('91Mi9zpdkcoQEN5748MGeyeBTVRKLUoWzxq51nAnq2No');

const connection = new Connection(RPC, 'confirmed');

async function investigate() {
  console.log('🔍 Investigating Bootstrap Program State...\n');
  console.log('Network:', NETWORK);
  console.log('Program:', BOOTSTRAP_PROGRAM.toBase58());
  console.log('RPC:', RPC);
  console.log('');

  try {
    const accounts = await connection.getProgramAccounts(BOOTSTRAP_PROGRAM);
    console.log('✅ Total accounts found:', accounts.length);
    console.log('');

    for (const { pubkey, account } of accounts) {
      const data = account.data;
      const disc = data.slice(0, 8).toString('hex');
      console.log('📦 Account:', pubkey.toBase58());
      console.log('   Size:', account.data.length, 'bytes');
      console.log('   Discriminator:', disc);
      console.log('   Lamports:', account.lamports);

      if (disc === '64ae7350782f6f7a') {
        console.log('   Type: BootstrapState ⭐');
        const buf = Buffer.from(data);
        let off = 8 + 32 + 1 + 32 + 32 + 32 + 32;
        const startRate = buf.readBigUInt64LE(off); off += 8;
        const endRate = buf.readBigUInt64LE(off); off += 8;
        const allocationCap = buf.readBigUInt64LE(off); off += 8;
        const minContribution = buf.readBigUInt64LE(off); off += 8;
        const maxPerWallet = buf.readBigUInt64LE(off); off += 8;
        const paused = buf.readUInt8(off); off += 1;
        const complete = buf.readUInt8(off); off += 1;
        const totalContributed = buf.readBigUInt64LE(off); off += 8;
        const totalAllocated = buf.readBigUInt64LE(off); off += 8;
        const contributorCount = buf.readBigUInt64LE(off); off += 8;

        console.log('   Start Rate:', Number(startRate).toLocaleString());
        console.log('   Total Contributed (lamports):', Number(totalContributed).toLocaleString());
        console.log('   Total Contributed (SOL):', Number(totalContributed) / 1e9);
        console.log('   Total Allocated (raw):', Number(totalAllocated).toLocaleString());
        console.log('   Total Allocated (CLWDN):', Number(totalAllocated) / 1e9);
        console.log('   Contributor Count:', Number(contributorCount));
        console.log('   Paused:', paused > 0);
        console.log('   Complete:', complete > 0);
      } else if (disc === 'cd5086e45587c5b0') {
        console.log('   Type: ContributorRecord 👤');
        const buf = Buffer.from(data);
        let off = 8;
        const contributor = new PublicKey(buf.slice(off, off + 32)); off += 32;
        const totalContributed = buf.readBigUInt64LE(off); off += 8;
        const totalAllocated = buf.readBigUInt64LE(off); off += 8;
        const count = buf.readBigUInt64LE(off); off += 8;

        console.log('   Contributor:', contributor.toBase58());
        console.log('   Total Contributed (lamports):', Number(totalContributed).toLocaleString());
        console.log('   Total Contributed (SOL):', Number(totalContributed) / 1e9);
        console.log('   Total Allocated (raw):', Number(totalAllocated).toLocaleString());
        console.log('   Total Allocated (CLWDN):', Number(totalAllocated) / 1e9);
        console.log('   Contribution Count:', Number(count));
      }
      console.log('');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
  }
}

investigate().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
