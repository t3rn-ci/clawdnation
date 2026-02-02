/**
 * ClawdNation CLWDN/SOL Pool Creator — Raydium CPMM
 * 
 * Creates a Raydium CPMM liquidity pool: CLWDN / SOL
 * Works for both devnet and mainnet.
 * 
 * Usage:
 *   NETWORK=devnet node solana/create-clwdn-pool.js [--clwdnAmount <amount>] [--solAmount <lamports>]
 *   NETWORK=mainnet node solana/create-clwdn-pool.js [--clwdnAmount <amount>] [--solAmount <lamports>]
 * 
 * Defaults (devnet): 400M CLWDN + 1 SOL
 * For mainnet bootstrap: 400M CLWDN + bootstrap SOL (80% of contributions)
 */

const {
  Raydium,
  TxVersion,
  DEV_API_URLS,
  API_URLS,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} = require('@raydium-io/raydium-sdk-v2');
const { Connection, Keypair, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const BN = require('bn.js');
const fs = require('fs');

// --- Config ---
const NETWORK = process.env.NETWORK || 'devnet';
const IS_MAINNET = NETWORK === 'mainnet';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || '/root/.config/solana/clawdnation.json';
const RPC_URL = process.env.SOLANA_RPC || (IS_MAINNET ? 'https://api.mainnet-beta.solana.com' : clusterApiUrl('devnet'));

// CLWDN mint — for mainnet, override with CLWDN_MINT env
const CLWDN_MINT = process.env.CLWDN_MINT || '2poZXLqSbgjLBugaxNqgcF5VVj9qeLWEJNwd1qqBbVs3';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Default pool amounts
// 400M CLWDN (40% of supply for LP)
// Devnet: 1 SOL for testing; Mainnet: 8000 SOL (80% of 10k bootstrap target)
const DEFAULT_CLWDN_AMOUNT = '400000000000000000'; // 400M * 10^9 decimals
const DEFAULT_SOL_AMOUNT = IS_MAINNET ? '8000000000000' : '1000000000';

function loadKeypair(kpPath) {
  const secret = JSON.parse(fs.readFileSync(kpPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function initRaydium(owner, connection) {
  console.log('   Network: ' + NETWORK);
  console.log('   RPC: ' + RPC_URL);
  
  const config = {
    owner,
    connection,
    cluster: IS_MAINNET ? 'mainnet' : 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: 'finalized',
  };

  if (!IS_MAINNET) {
    config.urlConfigs = {
      ...DEV_API_URLS,
      BASE_HOST: 'https://api-v3-devnet.raydium.io',
      OWNER_BASE_HOST: 'https://owner-v1-devnet.raydium.io',
      SWAP_HOST: 'https://transaction-v1-devnet.raydium.io',
      CPMM_LOCK: 'https://dynamic-ipfs-devnet.raydium.io/lock/cpmm/position',
    };
  }

  return await Raydium.load(config);
}

async function createClwdnPool(clwdnAmount, solAmount) {
  clwdnAmount = new BN(clwdnAmount || DEFAULT_CLWDN_AMOUNT);
  solAmount = new BN(solAmount || DEFAULT_SOL_AMOUNT);

  const clwdnUi = Number(clwdnAmount.toString()) / 1e9;
  const solUi = Number(solAmount.toString()) / 1e9;
  const price = solUi / clwdnUi;

  console.log('\n=== Creating CLWDN/SOL Raydium CPMM Pool ===');
  console.log('   CLWDN mint: ' + CLWDN_MINT);
  console.log('   CLWDN amount: ' + clwdnUi + ' CLWDN');
  console.log('   SOL amount: ' + solUi + ' SOL');
  console.log('   Initial price: ' + price.toFixed(10) + ' SOL per CLWDN');

  const owner = loadKeypair(KEYPAIR_PATH);
  console.log('   Authority: ' + owner.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Check balances
  const solBal = await connection.getBalance(owner.publicKey);
  console.log('   SOL balance: ' + (solBal / 1e9) + ' SOL');
  if (solBal < Number(solAmount.toString()) + 50000000) {
    throw new Error('Insufficient SOL balance. Need ' + solUi + ' SOL + fees, have ' + (solBal / 1e9));
  }

  const raydium = await initRaydium(owner, connection);
  console.log('   Raydium SDK initialized');

  // CLWDN is legacy SPL Token (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)
  const mintA = {
    address: CLWDN_MINT,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: 9,
  };

  const mintB = {
    address: WSOL_MINT,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: 9,
  };

  console.log('   mintA (CLWDN): ' + JSON.stringify(mintA));
  console.log('   mintB (WSOL):  ' + JSON.stringify(mintB));

  // Fee configs
  console.log('   Fetching CPMM fee configs...');
  const feeConfigs = await raydium.api.getCpmmConfigs();
  console.log('   Got ' + feeConfigs.length + ' fee config(s)');

  if (!IS_MAINNET) {
    feeConfigs.forEach((cfg) => {
      cfg.id = getCpmmPdaAmmConfigId(
        DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        cfg.index
      ).publicKey.toBase58();
    });
  }

  if (feeConfigs.length === 0) {
    throw new Error('No CPMM fee configs found');
  }

  console.log('   Using fee config: ' + feeConfigs[0].id + ' (index: ' + feeConfigs[0].index + ')');

  // Program IDs
  const programId = IS_MAINNET
    ? new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')
    : DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;

  const poolFeeAccount = IS_MAINNET
    ? new PublicKey('G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2')
    : DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC;

  console.log('   Building pool creation transaction...');
  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId,
    poolFeeAccount,
    mintA,
    mintB,
    mintAAmount: clwdnAmount,
    mintBAmount: solAmount,
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion: TxVersion.V0,
  });

  const poolKeys = {};
  if (extInfo && extInfo.address) {
    for (const [key, val] of Object.entries(extInfo.address)) {
      poolKeys[key] = val && typeof val === 'object' && val.toBase58 ? val.toBase58() : String(val);
    }
  }

  console.log('   Pool ID: ' + (poolKeys.poolId || 'unknown'));
  console.log('   Executing transaction...');

  const { txId } = await execute({ sendAndConfirm: true });

  const explorerSuffix = IS_MAINNET ? '' : '?cluster=devnet';
  const result = {
    network: NETWORK,
    txId,
    poolId: poolKeys.poolId || null,
    poolKeys,
    clwdnMint: CLWDN_MINT,
    clwdnAmount: clwdnAmount.toString(),
    solAmount: solAmount.toString(),
    initialPriceSolPerClwdn: price,
    explorer: 'https://explorer.solana.com/tx/' + txId + explorerSuffix,
    poolExplorer: poolKeys.poolId
      ? 'https://explorer.solana.com/address/' + poolKeys.poolId + explorerSuffix
      : null,
    raydium: poolKeys.poolId
      ? 'https://raydium.io/pools/' + poolKeys.poolId
      : null,
    createdAt: new Date().toISOString(),
  };

  console.log('\n=== Pool Created! ===');
  console.log('   Network: ' + NETWORK);
  console.log('   TX: ' + result.explorer);
  if (result.poolExplorer) console.log('   Pool: ' + result.poolExplorer);
  if (result.raydium) console.log('   Raydium: ' + result.raydium);
  console.log('   Price: ' + price.toFixed(10) + ' SOL/CLWDN');

  // Save pool info
  const poolFile = 'solana/clwdn-pool-' + NETWORK + '.json';
  fs.writeFileSync(poolFile, JSON.stringify(result, null, 2));
  console.log('   Saved to ' + poolFile);

  return result;
}

// CLI
function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace('--', '');
    args[key] = argv[i + 1];
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs();
  console.log('ClawdNation CLWDN/SOL Pool Creator');
  console.log('==================================');
  createClwdnPool(args.clwdnAmount, args.solAmount)
    .then(r => {
      console.log('\nFull result:', JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch(e => {
      console.error('\nError: ' + e.message);
      console.error(e.stack);
      process.exit(1);
    });
}

module.exports = { createClwdnPool };
