/**
 * ClawdNation CPMM Pool Creator — Raydium SDK V2
 * 
 * Creates a Raydium CPMM liquidity pool (TOKEN/SOL) on Solana devnet.
 * Uses Token-2022 tokens minted by the ClawdNation token factory.
 * 
 * Usage:
 *   node create-pool.js --mint <TOKEN_MINT> [--tokenAmount <amount>] [--solAmount <amount>]
 * 
 * Defaults: 100M tokens (with 9 decimals) + 0.5 SOL
 */

const {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
  DEV_API_URLS,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} = require('@raydium-io/raydium-sdk-v2');
const { Connection, Keypair, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const BN = require('bn.js');
const fs = require('fs');

// --- Config ---
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || '/root/.config/solana/clawdnation.json';
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const CLUSTER = 'devnet';

// WSOL mint (same on devnet and mainnet)
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// Default amounts (in lamports / smallest unit)
const DEFAULT_TOKEN_AMOUNT = '100000000000000000'; // 100M tokens * 10^9 decimals
const DEFAULT_SOL_AMOUNT = '500000000';            // 0.5 SOL in lamports

function loadKeypair(path) {
  const secret = JSON.parse(fs.readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function initRaydium(owner, connection) {
  console.log(`   Connecting to ${RPC_URL} on ${CLUSTER}...`);
  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: CLUSTER,
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: 'finalized',
    urlConfigs: {
      ...DEV_API_URLS,
      BASE_HOST: 'https://api-v3-devnet.raydium.io',
      OWNER_BASE_HOST: 'https://owner-v1-devnet.raydium.io',
      SWAP_HOST: 'https://transaction-v1-devnet.raydium.io',
      CPMM_LOCK: 'https://dynamic-ipfs-devnet.raydium.io/lock/cpmm/position',
    },
  });
  return raydium;
}

/**
 * Create a Raydium CPMM pool for a Token-2022 token paired with SOL.
 * 
 * @param {string} mint - Token mint address (Token-2022)
 * @param {string|BN} tokenAmount - Amount of tokens (in smallest unit / lamports)
 * @param {string|BN} solAmount - Amount of SOL (in lamports)
 * @returns {Object} { txId, poolId, poolKeys }
 */
async function createPool(mint, tokenAmount, solAmount) {
  tokenAmount = new BN(tokenAmount || DEFAULT_TOKEN_AMOUNT);
  solAmount = new BN(solAmount || DEFAULT_SOL_AMOUNT);

  console.log(`\n🏊 Creating Raydium CPMM Pool`);
  console.log(`   Token mint: ${mint}`);
  console.log(`   Token amount: ${tokenAmount.toString()}`);
  console.log(`   SOL amount: ${solAmount.toString()} lamports (${Number(solAmount) / 1e9} SOL)`);

  // Load keypair
  const owner = loadKeypair(KEYPAIR_PATH);
  console.log(`   Authority: ${owner.publicKey.toBase58()}`);

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  const raydium = await initRaydium(owner, connection);
  console.log('   Raydium SDK initialized ✅');

  // Get token info - for our Token-2022 token, provide it directly
  // since devnet tokens might not be in the Raydium token list
  const mintA = {
    address: mint,
    programId: TOKEN_2022_PROGRAM,
    decimals: 9,
  };

  // WSOL - always legacy token program
  const mintB = {
    address: WSOL_MINT,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    decimals: 9,
  };

  console.log('   mintA (token):', mintA);
  console.log('   mintB (WSOL):', mintB);

  // Get fee configs and fix IDs for devnet
  console.log('   Fetching CPMM fee configs...');
  const feeConfigs = await raydium.api.getCpmmConfigs();
  console.log(`   Got ${feeConfigs.length} fee config(s)`);

  feeConfigs.forEach((config) => {
    config.id = getCpmmPdaAmmConfigId(
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      config.index
    ).publicKey.toBase58();
  });

  if (feeConfigs.length === 0) {
    throw new Error('No CPMM fee configs found on devnet API');
  }

  console.log(`   Using fee config: ${feeConfigs[0].id} (index: ${feeConfigs[0].index})`);

  // Create pool
  console.log('   Building pool creation transaction...');
  const { execute, extInfo, transaction } = await raydium.cpmm.createPool({
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount: tokenAmount,
    mintBAmount: solAmount,
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion: TxVersion.V0,
  });

  // Extract pool info before executing
  const poolKeys = {};
  if (extInfo && extInfo.address) {
    for (const [key, val] of Object.entries(extInfo.address)) {
      if (val && typeof val === 'object' && val.toString) {
        // PublicKey or similar — use toBase58 if available, else toString
        poolKeys[key] = val.toBase58 ? val.toBase58() : val.toString();
      } else {
        poolKeys[key] = String(val);
      }
    }
  }

  console.log('   Pool ID:', poolKeys.poolId || 'unknown');
  console.log('   Sending transaction...');

  // Execute
  const { txId } = await execute({ sendAndConfirm: true });

  const result = {
    txId,
    poolId: poolKeys.poolId || null,
    poolKeys,
    mint,
    tokenAmount: tokenAmount.toString(),
    solAmount: solAmount.toString(),
    explorer: `https://explorer.solana.com/tx/${txId}?cluster=devnet`,
    poolExplorer: poolKeys.poolId
      ? `https://explorer.solana.com/address/${poolKeys.poolId}?cluster=devnet`
      : null,
  };

  console.log('\n✅ Pool created!');
  console.log(`   TX: ${result.explorer}`);
  if (result.poolExplorer) {
    console.log(`   Pool: ${result.poolExplorer}`);
  }

  return result;
}

// --- CLI mode ---
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
  if (!args.mint) {
    console.error('Usage: node create-pool.js --mint <TOKEN_MINT> [--tokenAmount <amount>] [--solAmount <amount>]');
    console.error('');
    console.error('  --mint         Token-2022 mint address (required)');
    console.error('  --tokenAmount  Token amount in smallest unit (default: 100M * 10^9)');
    console.error('  --solAmount    SOL amount in lamports (default: 500000000 = 0.5 SOL)');
    process.exit(1);
  }
  createPool(args.mint, args.tokenAmount, args.solAmount)
    .then((result) => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error('❌ Error creating pool:', e.message);
      console.error(e.stack);
      process.exit(1);
    });
}

module.exports = { createPool };
