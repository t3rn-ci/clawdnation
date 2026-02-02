/**
 * Configurable Token Factory
 *
 * Owner can configure tokenomics for each token launch:
 * - LP ratio (default: 70%)
 * - Founder vest ratio & period (default: 10%, 12 months)
 * - Treasury ratio (default: 10%)
 * - Launch/Burn ratio (default: 10%)
 *
 * DEFAULT: 70/10/10/10 (proven from factory)
 * CUSTOMIZABLE: Any ratio, any vesting period
 */

const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const CONFIG_PATH = path.join(__dirname, 'tokenomics-config.json');

// Authority keypair
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

console.log('🏭 Configurable Token Factory');
console.log('Authority:', authority.publicKey.toBase58());

// ═══════════════════════════════════════════════════════
// DEFAULT TOKENOMICS (Factory Proven)
// ═══════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  name: 'Factory Default',
  description: 'Proven 70/10/10/10 split with 12-month founder vesting',

  // Percentages (must sum to 100)
  liquidityPercent: 70,      // % to liquidity pool
  founderPercent: 10,         // % to founder (vested)
  treasuryPercent: 10,        // % to ClawdNation treasury
  launchPercent: 10,          // % to launch/burn

  // Vesting
  founderVestingMonths: 12,   // Linear vest over 12 months

  // Launch vs Burn
  launchMode: 'burn',         // 'burn' or 'distribute'
  // If distribute:
  launchDistribution: null,   // Set to { method: 'twitter', amount: 1000, max: 10000 }

  // Timestamps
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ═══════════════════════════════════════════════════════
// CONFIG MANAGEMENT
// ═══════════════════════════════════════════════════════

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading config:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  config.updatedAt = new Date().toISOString();

  // Validate: must sum to 100%
  const sum = config.liquidityPercent + config.founderPercent +
              config.treasuryPercent + config.launchPercent;
  if (sum !== 100) {
    throw new Error(`❌ Percentages must sum to 100! Current: ${sum}%`);
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`✅ Config saved: ${CONFIG_PATH}`);
  return config;
}

function resetToDefault() {
  console.log('🔄 Resetting to factory default config...');
  const config = { ...DEFAULT_CONFIG, createdAt: new Date().toISOString() };
  saveConfig(config);
  console.log('✅ Reset complete!');
  viewConfig();
  return config;
}

// ═══════════════════════════════════════════════════════
// CONFIG OPERATIONS
// ═══════════════════════════════════════════════════════

function viewConfig() {
  const config = loadConfig();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Current Tokenomics Configuration');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`📊 ${config.name}`);
  console.log(`   ${config.description}`);
  console.log('');

  console.log(`💧 Liquidity Pool: ${config.liquidityPercent}%`);
  console.log(`   Goes to Raydium CPMM pool`);
  console.log('');

  console.log(`👤 Founder Allocation: ${config.founderPercent}%`);
  console.log(`   Vesting: ${config.founderVestingMonths} months (linear)`);
  console.log(`   Monthly unlock: ${(config.founderPercent / config.founderVestingMonths).toFixed(2)}%`);
  console.log('');

  console.log(`🏦 Treasury: ${config.treasuryPercent}%`);
  console.log(`   ClawdNation treasury (immediate)`);
  console.log('');

  console.log(`🚀 Launch Phase: ${config.launchPercent}%`);
  if (config.launchMode === 'burn') {
    console.log(`   Mode: BURN 🔥 (deflationary)`);
  } else {
    console.log(`   Mode: DISTRIBUTE (via ${config.launchDistribution?.method || 'custom'})`);
    if (config.launchDistribution) {
      console.log(`   Per user: ${config.launchDistribution.amount?.toLocaleString() || 'N/A'}`);
      console.log(`   Max users: ${config.launchDistribution.max?.toLocaleString() || 'N/A'}`);
    }
  }
  console.log('');

  console.log(`📅 Created: ${new Date(config.createdAt).toLocaleString()}`);
  console.log(`📅 Updated: ${new Date(config.updatedAt).toLocaleString()}`);

  // Validation
  const sum = config.liquidityPercent + config.founderPercent +
              config.treasuryPercent + config.launchPercent;
  console.log(`\n✅ Total: ${sum}% ${sum === 100 ? '(Valid)' : '❌ (INVALID!)'}`);
}

function updateConfig(updates) {
  console.log('🔧 Updating tokenomics config...');

  const config = loadConfig();

  // Apply updates
  if (updates.name) config.name = updates.name;
  if (updates.description) config.description = updates.description;
  if (updates.liquidityPercent !== undefined) config.liquidityPercent = Number(updates.liquidityPercent);
  if (updates.founderPercent !== undefined) config.founderPercent = Number(updates.founderPercent);
  if (updates.treasuryPercent !== undefined) config.treasuryPercent = Number(updates.treasuryPercent);
  if (updates.launchPercent !== undefined) config.launchPercent = Number(updates.launchPercent);
  if (updates.founderVestingMonths !== undefined) config.founderVestingMonths = Number(updates.founderVestingMonths);
  if (updates.launchMode) config.launchMode = updates.launchMode;

  // Validate
  try {
    saveConfig(config);
    console.log('✅ Config updated successfully!');
    viewConfig();
    return config;
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════
// TOKEN CREATION (Using Current Config)
// ═══════════════════════════════════════════════════════

function calculateAllocations(supply, configOverride = null) {
  const config = configOverride || loadConfig();

  const liquidityTokens = Math.floor(supply * config.liquidityPercent / 100);
  const founderTokens = Math.floor(supply * config.founderPercent / 100);
  const treasuryTokens = Math.floor(supply * config.treasuryPercent / 100);
  const launchTokens = supply - liquidityTokens - founderTokens - treasuryTokens; // Handles rounding

  return {
    config: {
      name: config.name,
      ratios: `${config.liquidityPercent}/${config.founderPercent}/${config.treasuryPercent}/${config.launchPercent}`,
      founderVesting: `${config.founderVestingMonths} months`,
      launchMode: config.launchMode,
    },
    allocations: {
      liquidity: {
        tokens: liquidityTokens,
        percent: config.liquidityPercent,
        description: 'Raydium CPMM pool',
      },
      founder: {
        tokens: founderTokens,
        percent: config.founderPercent,
        description: `Vested over ${config.founderVestingMonths} months`,
        vestingMonths: config.founderVestingMonths,
        monthlyUnlock: Math.floor(founderTokens / config.founderVestingMonths),
      },
      treasury: {
        tokens: treasuryTokens,
        percent: config.treasuryPercent,
        description: 'ClawdNation treasury',
      },
      launch: {
        tokens: launchTokens,
        percent: config.launchPercent,
        description: config.launchMode === 'burn' ? 'Burned (deflationary)' : 'Distributed to community',
        mode: config.launchMode,
      },
    },
    totals: {
      supply,
      allocated: liquidityTokens + founderTokens + treasuryTokens + launchTokens,
    },
  };
}

function previewTokenomics(supply = 1_000_000_000, customConfig = null) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Token Launch Preview');
  console.log('═══════════════════════════════════════════════════════\n');

  const result = calculateAllocations(supply, customConfig);

  console.log(`📊 Config: ${result.config.name}`);
  console.log(`   Ratios: ${result.config.ratios}`);
  console.log(`   Founder vesting: ${result.config.founderVesting}`);
  console.log('');

  console.log(`🪙 Total Supply: ${supply.toLocaleString()} tokens`);
  console.log('');

  console.log(`💧 Liquidity (${result.allocations.liquidity.percent}%):`);
  console.log(`   ${result.allocations.liquidity.tokens.toLocaleString()} tokens`);
  console.log(`   → ${result.allocations.liquidity.description}`);
  console.log('');

  console.log(`👤 Founder (${result.allocations.founder.percent}%):`);
  console.log(`   ${result.allocations.founder.tokens.toLocaleString()} tokens`);
  console.log(`   → ${result.allocations.founder.description}`);
  console.log(`   Monthly unlock: ${result.allocations.founder.monthlyUnlock.toLocaleString()} tokens`);
  console.log('');

  console.log(`🏦 Treasury (${result.allocations.treasury.percent}%):`);
  console.log(`   ${result.allocations.treasury.tokens.toLocaleString()} tokens`);
  console.log(`   → ${result.allocations.treasury.description}`);
  console.log('');

  console.log(`🚀 Launch (${result.allocations.launch.percent}%):`);
  console.log(`   ${result.allocations.launch.tokens.toLocaleString()} tokens`);
  console.log(`   → ${result.allocations.launch.description}`);
  console.log('');

  console.log(`✅ Total allocated: ${result.totals.allocated.toLocaleString()} tokens`);

  return result;
}

// ═══════════════════════════════════════════════════════
// PRESET CONFIGS
// ═══════════════════════════════════════════════════════

const PRESETS = {
  factory: {
    name: 'Factory Default',
    description: 'Proven 70/10/10/10 with 12mo vest',
    liquidityPercent: 70,
    founderPercent: 10,
    treasuryPercent: 10,
    launchPercent: 10,
    founderVestingMonths: 12,
    launchMode: 'burn',
  },

  aggressive: {
    name: 'Aggressive Launch',
    description: '50% LP, 20% launch distribution, 10% burn',
    liquidityPercent: 50,
    founderPercent: 20,
    treasuryPercent: 10,
    launchPercent: 20,
    founderVestingMonths: 6,
    launchMode: 'distribute',
    launchDistribution: { method: 'twitter', amount: 10000, max: 2000 },
  },

  conservative: {
    name: 'Conservative Growth',
    description: '80% LP for stability, 5% launch, 24mo vest',
    liquidityPercent: 80,
    founderPercent: 10,
    treasuryPercent: 5,
    launchPercent: 5,
    founderVestingMonths: 24,
    launchMode: 'burn',
  },

  community: {
    name: 'Community First',
    description: '30% launch distribution, 60% LP',
    liquidityPercent: 60,
    founderPercent: 5,
    treasuryPercent: 5,
    launchPercent: 30,
    founderVestingMonths: 12,
    launchMode: 'distribute',
    launchDistribution: { method: 'twitter', amount: 5000, max: 6000 },
  },
};

function applyPreset(presetName) {
  if (!PRESETS[presetName]) {
    console.error(`❌ Preset "${presetName}" not found!`);
    console.log(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`📋 Applying preset: ${presetName}`);
  const preset = { ...PRESETS[presetName], createdAt: new Date().toISOString() };
  saveConfig(preset);
  viewConfig();
  return preset;
}

function listPresets() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Available Presets');
  console.log('═══════════════════════════════════════════════════════\n');

  Object.entries(PRESETS).forEach(([key, preset]) => {
    console.log(`📋 ${key}: ${preset.name}`);
    console.log(`   ${preset.description}`);
    console.log(`   Ratios: ${preset.liquidityPercent}/${preset.founderPercent}/${preset.treasuryPercent}/${preset.launchPercent}`);
    console.log(`   Vesting: ${preset.founderVestingMonths} months`);
    console.log(`   Launch: ${preset.launchMode}`);
    console.log('');
  });
}

// ═══════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].replace('--', '');
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      if (args[key] !== true) i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  if (args.view || args.status) {
    viewConfig();
  } else if (args.reset) {
    resetToDefault();
  } else if (args.preset) {
    applyPreset(args.preset);
  } else if (args['list-presets']) {
    listPresets();
  } else if (args.update) {
    updateConfig(args);
  } else if (args.preview) {
    const supply = args.supply ? Number(args.supply) : 1_000_000_000;
    previewTokenomics(supply);
  } else {
    console.log(`
Configurable Token Factory — Custom Tokenomics

Commands:
  View config:     node configurable-factory.js --view
  Reset default:   node configurable-factory.js --reset
  List presets:    node configurable-factory.js --list-presets
  Apply preset:    node configurable-factory.js --preset <name>

  Update config:   node configurable-factory.js --update \\
                     --liquidityPercent 65 \\
                     --founderPercent 15 \\
                     --treasuryPercent 10 \\
                     --launchPercent 10 \\
                     --founderVestingMonths 18

  Preview launch:  node configurable-factory.js --preview [--supply 1000000000]

Default Config (Factory Proven):
  70% → Liquidity Pool
  10% → Founder (12-month vest)
  10% → Treasury
  10% → Launch/Burn

Examples:
  # View current config
  node configurable-factory.js --view

  # Apply aggressive launch preset
  node configurable-factory.js --preset aggressive

  # Custom config
  node configurable-factory.js --update --liquidityPercent 80 --launchPercent 5

  # Preview token with 500M supply
  node configurable-factory.js --preview --supply 500000000

  # Reset to factory default
  node configurable-factory.js --reset
    `);
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  });
}

module.exports = {
  loadConfig,
  saveConfig,
  updateConfig,
  calculateAllocations,
  previewTokenomics,
  DEFAULT_CONFIG,
  PRESETS,
};
