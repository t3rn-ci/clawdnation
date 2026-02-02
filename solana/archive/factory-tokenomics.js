/**
 * ClawdNation Factory Tokenomics
 *
 * Comprehensive default model with staking, airdrops, and bootstrap.
 * CLWDN itself is created via this factory!
 *
 * DEFAULT ALLOCATION:
 * - Bootstrap Distribution: 10% (100M) - Initial sale/distribution
 * - Liquidity (LP locked): 40% (400M) - Deep liquidity pool
 * - Staking Rewards: 15% (150M) - 4-year linear vest
 * - Team: 15% (150M) - 6-month cliff + 12-month vest
 * - Community & Airdrops: 10% (100M) - Community growth
 * - Treasury: 10% (100M) - Operations
 */

const fs = require('fs');
const path = require('path');
const { Connection, Keypair } = require('@solana/web3.js');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

const CONFIG_PATH = path.join(__dirname, 'factory-tokenomics-config.json');

// Authority keypair
const authorityPath = process.env.AUTHORITY_KEYPAIR || path.join(process.env.HOME, '.config/solana/id.json');
const authorityKey = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(authorityKey));

console.log('🏭 ClawdNation Factory Tokenomics');
console.log('Authority:', authority.publicKey.toBase58());

// ═══════════════════════════════════════════════════════
// DEFAULT TOKENOMICS (6-Allocation Model)
// ═══════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  name: 'ClawdNation Default',
  description: 'Comprehensive model with staking, airdrops, and bootstrap',
  version: '2.0',

  // Percentages (must sum to 100)
  allocations: {
    bootstrap: {
      percent: 10,
      description: 'Bootstrap distribution (initial sale)',
      vesting: { months: 0, cliff: 0 },
    },
    liquidity: {
      percent: 40,
      description: 'Liquidity pool (locked)',
      vesting: { months: 0, cliff: 0 },
      locked: true,
    },
    staking: {
      percent: 15,
      description: 'Staking rewards',
      vesting: { months: 48, cliff: 0 }, // 4 years linear
    },
    team: {
      percent: 15,
      description: 'Team allocation',
      vesting: { months: 12, cliff: 6 }, // 6m cliff + 12m vest
    },
    community: {
      percent: 10,
      description: 'Community & airdrops',
      vesting: { months: 0, cliff: 0 },
    },
    treasury: {
      percent: 10,
      description: 'Treasury operations',
      vesting: { months: 0, cliff: 0 },
    },
  },

  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
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
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy
}

function saveConfig(config) {
  config.metadata = config.metadata || {};
  config.metadata.updatedAt = new Date().toISOString();

  // Validate: must sum to 100%
  const sum = Object.values(config.allocations).reduce((acc, a) => acc + a.percent, 0);
  if (sum !== 100) {
    throw new Error(`❌ Percentages must sum to 100! Current: ${sum}%`);
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`✅ Config saved: ${CONFIG_PATH}`);
  return config;
}

function resetToDefault() {
  console.log('🔄 Resetting to ClawdNation default config...');
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.metadata.createdAt = new Date().toISOString();
  saveConfig(config);
  console.log('✅ Reset complete!');
  viewConfig();
  return config;
}

// ═══════════════════════════════════════════════════════
// VIEW CONFIG
// ═══════════════════════════════════════════════════════

function viewConfig() {
  const config = loadConfig();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   Factory Tokenomics Configuration');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`📊 ${config.name} (v${config.version || '1.0'})`);
  console.log(`   ${config.description}`);
  console.log('');

  // Bootstrap
  const bootstrap = config.allocations.bootstrap;
  console.log(`🎯 Bootstrap Distribution: ${bootstrap.percent}%`);
  console.log(`   ${bootstrap.description}`);
  console.log(`   Vesting: Immediate`);
  console.log('');

  // Liquidity
  const liquidity = config.allocations.liquidity;
  console.log(`💧 Liquidity Pool: ${liquidity.percent}%`);
  console.log(`   ${liquidity.description}`);
  console.log(`   ${liquidity.locked ? '🔒 LOCKED' : 'Unlocked'}`);
  console.log('');

  // Staking
  const staking = config.allocations.staking;
  console.log(`⚡ Staking Rewards: ${staking.percent}%`);
  console.log(`   ${staking.description}`);
  console.log(`   Vesting: ${staking.vesting.months} months linear`);
  console.log(`   Monthly unlock: ${(staking.percent / staking.vesting.months).toFixed(2)}%`);
  console.log('');

  // Team
  const team = config.allocations.team;
  console.log(`👥 Team: ${team.percent}%`);
  console.log(`   ${team.description}`);
  console.log(`   Cliff: ${team.vesting.cliff} months`);
  console.log(`   Vesting: ${team.vesting.months} months after cliff`);
  console.log(`   Monthly unlock: ${(team.percent / team.vesting.months).toFixed(2)}% (after cliff)`);
  console.log('');

  // Community
  const community = config.allocations.community;
  console.log(`🎁 Community & Airdrops: ${community.percent}%`);
  console.log(`   ${community.description}`);
  console.log(`   Vesting: Manual distribution`);
  console.log('');

  // Treasury
  const treasury = config.allocations.treasury;
  console.log(`🏦 Treasury: ${treasury.percent}%`);
  console.log(`   ${treasury.description}`);
  console.log(`   Governance controlled`);
  console.log('');

  // Total
  const totalPercent = Object.values(config.allocations).reduce((acc, a) => acc + a.percent, 0);
  console.log(`✅ Total: ${totalPercent}% ${totalPercent === 100 ? '(Valid)' : '❌ (INVALID!)'}`);

  console.log(`\n📅 Created: ${new Date(config.metadata.createdAt).toLocaleString()}`);
  console.log(`📅 Updated: ${new Date(config.metadata.updatedAt).toLocaleString()}`);
}

// ═══════════════════════════════════════════════════════
// CALCULATE ALLOCATIONS FOR TOKEN
// ═══════════════════════════════════════════════════════

function calculateAllocations(supply, configOverride = null) {
  const config = configOverride || loadConfig();
  const allocs = config.allocations;

  const result = {
    supply,
    config: {
      name: config.name,
      version: config.version,
    },
    allocations: {},
  };

  // Calculate each allocation
  for (const [key, alloc] of Object.entries(allocs)) {
    const tokens = Math.floor(supply * alloc.percent / 100);

    result.allocations[key] = {
      name: key.charAt(0).toUpperCase() + key.slice(1),
      tokens,
      percent: alloc.percent,
      description: alloc.description,
      vesting: alloc.vesting,
      locked: alloc.locked || false,
    };

    // Add monthly unlock if vested
    if (alloc.vesting.months > 0) {
      result.allocations[key].monthlyUnlock = Math.floor(tokens / alloc.vesting.months);
    }
  }

  // Calculate total (handle rounding)
  const totalAllocated = Object.values(result.allocations).reduce((acc, a) => acc + a.tokens, 0);

  // Add any rounding remainder to liquidity
  if (totalAllocated < supply) {
    const diff = supply - totalAllocated;
    result.allocations.liquidity.tokens += diff;
    result.note = `Added ${diff} tokens to liquidity due to rounding`;
  }

  result.totalAllocated = supply;

  return result;
}

// ═══════════════════════════════════════════════════════
// PREVIEW TOKEN LAUNCH
// ═══════════════════════════════════════════════════════

function previewTokenLaunch(supply = 1_000_000_000, tokenName = 'EXAMPLE') {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`   ${tokenName} Token Launch Preview`);
  console.log('═══════════════════════════════════════════════════════\n');

  const result = calculateAllocations(supply);

  console.log(`📊 Config: ${result.config.name}`);
  console.log(`🪙 Total Supply: ${supply.toLocaleString()} tokens`);
  console.log('');

  // Display each allocation
  for (const [key, alloc] of Object.entries(result.allocations)) {
    console.log(`${getEmoji(key)} ${alloc.name} (${alloc.percent}%):`);
    console.log(`   ${alloc.tokens.toLocaleString()} tokens`);
    console.log(`   ${alloc.description}`);

    if (alloc.vesting.months > 0) {
      if (alloc.vesting.cliff > 0) {
        console.log(`   Cliff: ${alloc.vesting.cliff} months`);
        console.log(`   Vesting: ${alloc.vesting.months} months after cliff`);
      } else {
        console.log(`   Vesting: ${alloc.vesting.months} months linear`);
      }
      console.log(`   Monthly unlock: ${alloc.monthlyUnlock.toLocaleString()} tokens`);
    } else if (alloc.locked) {
      console.log(`   🔒 LP LOCKED`);
    } else {
      console.log(`   Immediate release`);
    }
    console.log('');
  }

  if (result.note) console.log(`ℹ️  ${result.note}\n`);

  console.log(`✅ Total: ${result.totalAllocated.toLocaleString()} tokens`);

  return result;
}

function getEmoji(key) {
  const emojis = {
    bootstrap: '🎯',
    liquidity: '💧',
    staking: '⚡',
    team: '👥',
    community: '🎁',
    treasury: '🏦',
  };
  return emojis[key] || '📦';
}

// ═══════════════════════════════════════════════════════
// PRESET CONFIGS
// ═══════════════════════════════════════════════════════

const PRESETS = {
  clawdnation: {
    name: 'ClawdNation Default',
    description: 'Comprehensive model with staking, airdrops, and bootstrap',
    version: '2.0',
    allocations: {
      bootstrap: { percent: 10, description: 'Bootstrap distribution', vesting: { months: 0, cliff: 0 } },
      liquidity: { percent: 40, description: 'Liquidity pool (locked)', vesting: { months: 0, cliff: 0 }, locked: true },
      staking: { percent: 15, description: 'Staking rewards', vesting: { months: 48, cliff: 0 } },
      team: { percent: 15, description: 'Team allocation', vesting: { months: 12, cliff: 6 } },
      community: { percent: 10, description: 'Community & airdrops', vesting: { months: 0, cliff: 0 } },
      treasury: { percent: 10, description: 'Treasury operations', vesting: { months: 0, cliff: 0 } },
    },
  },

  simple: {
    name: 'Simple 70/10/10/10',
    description: 'Basic factory model (no staking/airdrops)',
    version: '1.0',
    allocations: {
      bootstrap: { percent: 0, description: 'No bootstrap', vesting: { months: 0, cliff: 0 } },
      liquidity: { percent: 70, description: 'Liquidity pool', vesting: { months: 0, cliff: 0 }, locked: false },
      staking: { percent: 0, description: 'No staking', vesting: { months: 0, cliff: 0 } },
      team: { percent: 10, description: 'Team/Creator', vesting: { months: 12, cliff: 0 } },
      community: { percent: 10, description: 'Burn or airdrop', vesting: { months: 0, cliff: 0 } },
      treasury: { percent: 10, description: 'Treasury', vesting: { months: 0, cliff: 0 } },
    },
  },

  stakingHeavy: {
    name: 'Staking Heavy',
    description: 'Focus on staking rewards (25% staking)',
    version: '2.0',
    allocations: {
      bootstrap: { percent: 10, description: 'Bootstrap', vesting: { months: 0, cliff: 0 } },
      liquidity: { percent: 35, description: 'Liquidity pool', vesting: { months: 0, cliff: 0 }, locked: true },
      staking: { percent: 25, description: 'Staking rewards', vesting: { months: 60, cliff: 0 } }, // 5 years
      team: { percent: 15, description: 'Team', vesting: { months: 18, cliff: 6 } },
      community: { percent: 10, description: 'Community', vesting: { months: 0, cliff: 0 } },
      treasury: { percent: 5, description: 'Treasury', vesting: { months: 0, cliff: 0 } },
    },
  },

  communityFirst: {
    name: 'Community First',
    description: 'Focus on airdrops and community growth',
    version: '2.0',
    allocations: {
      bootstrap: { percent: 5, description: 'Small bootstrap', vesting: { months: 0, cliff: 0 } },
      liquidity: { percent: 40, description: 'Liquidity pool', vesting: { months: 0, cliff: 0 }, locked: true },
      staking: { percent: 10, description: 'Staking rewards', vesting: { months: 36, cliff: 0 } },
      team: { percent: 10, description: 'Team', vesting: { months: 12, cliff: 6 } },
      community: { percent: 25, description: 'Airdrops & growth', vesting: { months: 0, cliff: 0 } },
      treasury: { percent: 10, description: 'Treasury', vesting: { months: 0, cliff: 0 } },
    },
  },
};

function applyPreset(presetName) {
  if (!PRESETS[presetName]) {
    console.error(`❌ Preset "${presetName}" not found!`);
    console.log(`Available: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`📋 Applying preset: ${presetName}`);
  const preset = JSON.parse(JSON.stringify(PRESETS[presetName]));
  preset.metadata = { createdAt: new Date().toISOString() };
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
    const allocs = preset.allocations;
    console.log(`   Bootstrap: ${allocs.bootstrap.percent}%, LP: ${allocs.liquidity.percent}%, Staking: ${allocs.staking.percent}%`);
    console.log(`   Team: ${allocs.team.percent}%, Community: ${allocs.community.percent}%, Treasury: ${allocs.treasury.percent}%`);
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
  } else if (args.preview) {
    const supply = args.supply ? Number(args.supply) : 1_000_000_000;
    const name = args.name || 'CLWDN';
    previewTokenLaunch(supply, name);
  } else {
    console.log(`
ClawdNation Factory Tokenomics — 6-Allocation Model

DEFAULT:
  Bootstrap: 10% (100M)   - Initial distribution
  Liquidity: 40% (400M)   - LP locked
  Staking:   15% (150M)   - 4yr vest
  Team:      15% (150M)   - 6m cliff + 12m vest
  Community: 10% (100M)   - Airdrops
  Treasury:  10% (100M)   - Operations

Commands:
  View config:     node factory-tokenomics.js --view
  Reset default:   node factory-tokenomics.js --reset
  List presets:    node factory-tokenomics.js --list-presets
  Apply preset:    node factory-tokenomics.js --preset <name>
  Preview launch:  node factory-tokenomics.js --preview [--supply N] [--name TOKEN]

Presets:
  clawdnation    - Default 6-allocation model (recommended)
  simple         - Simple 70/10/10/10 (no staking/airdrops)
  stakingHeavy   - 25% staking, 5yr vest
  communityFirst - 25% airdrops, community focus

Examples:
  node factory-tokenomics.js --view
  node factory-tokenomics.js --preset clawdnation
  node factory-tokenomics.js --preview --name CLWDN --supply 1000000000
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
  calculateAllocations,
  previewTokenLaunch,
  DEFAULT_CONFIG,
  PRESETS,
};
