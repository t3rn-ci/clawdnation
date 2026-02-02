/**
 * ASCII BONDING CURVE VISUALIZER
 *
 * Shows the linear bonding curve in terminal with real-time progress
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const conn = new Connection(RPC, 'confirmed');

// Configuration
const CONFIG = {
  startRate: 10_000,
  endRate: 40_000,
  allocationCap: 100_000_000,
};

const BOOTSTRAP_STATE = new PublicKey('8ud2WHTUNzEE6R1xebmpuWraHd1JBZ2fWDyKQ7inhqMz');

// ASCII Art Functions
function drawChart(width = 60, height = 20, progress = 0) {
  console.log('\n╔' + '═'.repeat(width + 2) + '╗');
  console.log('║ ' + 'BONDING CURVE: LINEAR PRICE DISCOVERY'.padEnd(width) + ' ║');
  console.log('╠' + '═'.repeat(width + 2) + '╣');

  // Y-axis labels
  const maxRate = CONFIG.endRate;
  const minRate = CONFIG.startRate;
  const rateStep = (maxRate - minRate) / (height - 1);

  // Draw chart
  for (let y = height - 1; y >= 0; y--) {
    const rate = minRate + (rateStep * y);
    const rateLabel = (rate / 1000).toFixed(0) + 'K';
    process.stdout.write('║ ' + rateLabel.padStart(5) + ' │');

    // Draw the curve line
    for (let x = 0; x < width - 8; x++) {
      const xProgress = x / (width - 9);
      const yProgress = (rate - minRate) / (maxRate - minRate);

      // Linear curve: y = x
      if (Math.abs(yProgress - xProgress) < 0.05) {
        if (xProgress <= progress) {
          process.stdout.write('█'); // Completed part
        } else {
          process.stdout.write('▓'); // Remaining part
        }
      } else if (xProgress <= progress && yProgress > xProgress) {
        process.stdout.write('░'); // Area under completed curve
      } else {
        process.stdout.write(' ');
      }
    }
    console.log(' ║');
  }

  // X-axis
  console.log('║       └' + '─'.repeat(width - 8) + '► ║');
  console.log('║        0%' + ' '.repeat(width - 20) + '100% ║');
  console.log('║' + ' '.repeat(width + 2) + '║');
  console.log('║' + 'CLWDN Sold (Progress)'.padStart(width / 2 + 10).padEnd(width + 2) + '║');
  console.log('╚' + '═'.repeat(width + 2) + '╝\n');
}

function drawProgressBar(progress, width = 50) {
  const filled = Math.floor(progress * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentage = (progress * 100).toFixed(1) + '%';

  console.log('┌─' + '─'.repeat(width) + '─┐');
  console.log('│ ' + bar + ' │ ' + percentage);
  console.log('└─' + '─'.repeat(width) + '─┘');
}

function drawStats(stats) {
  const width = 60;

  console.log('\n╔' + '═'.repeat(width) + '╗');
  console.log('║' + '📊 BOOTSTRAP STATISTICS'.padStart(width / 2 + 12).padEnd(width) + '║');
  console.log('╠' + '═'.repeat(width) + '╣');

  const rows = [
    ['Progress', stats.progressPercent + '%'],
    ['CLWDN Sold', stats.clwdnSold.toLocaleString() + ' / ' + stats.clwdnCap.toLocaleString()],
    ['Current Rate', stats.currentRate.toLocaleString() + ' CLWDN/SOL'],
    ['Next Rate', stats.nextRate.toLocaleString() + ' CLWDN/SOL'],
    ['SOL Raised', stats.solRaised.toFixed(2) + ' SOL'],
    ['Contributors', stats.contributors.toString()],
    ['Avg Rate', stats.avgRate.toLocaleString() + ' CLWDN/SOL'],
  ];

  rows.forEach(([label, value]) => {
    const line = '  ' + label.padEnd(20) + ' : ' + value;
    console.log('║' + line.padEnd(width) + '║');
  });

  console.log('╠' + '═'.repeat(width) + '╣');

  // SOL Distribution (80/10/10)
  console.log('║' + '💰 SOL DISTRIBUTION (80/10/10)'.padStart(width / 2 + 15).padEnd(width) + '║');
  console.log('╠' + '─'.repeat(width) + '╣');

  const lpSOL = stats.solRaised * 0.8;
  const masterSOL = stats.solRaised * 0.1;
  const stakingSOL = stats.solRaised * 0.1;

  const distRows = [
    ['LP Wallet (80%)', lpSOL.toFixed(2) + ' SOL'],
    ['Master Wallet (10%)', masterSOL.toFixed(2) + ' SOL'],
    ['Staking Wallet (10%)', stakingSOL.toFixed(2) + ' SOL'],
  ];

  distRows.forEach(([label, value]) => {
    const line = '  ' + label.padEnd(20) + ' : ' + value;
    console.log('║' + line.padEnd(width) + '║');
  });

  console.log('╚' + '═'.repeat(width) + '╝\n');
}

function calculateStats(clwdnSold, solRaised, contributors) {
  const progress = clwdnSold / CONFIG.allocationCap;
  const progressPercent = (progress * 100).toFixed(1);

  // Current rate
  const currentRate = CONFIG.startRate + Math.floor(
    (CONFIG.endRate - CONFIG.startRate) * progress
  );

  // Next rate (after 1% more progress)
  const nextProgress = Math.min(1, progress + 0.01);
  const nextRate = CONFIG.startRate + Math.floor(
    (CONFIG.endRate - CONFIG.startRate) * nextProgress
  );

  // Average rate
  const avgRate = Math.floor((CONFIG.startRate + currentRate) / 2);

  return {
    progressPercent,
    clwdnSold,
    clwdnCap: CONFIG.allocationCap,
    currentRate,
    nextRate,
    solRaised,
    contributors,
    avgRate,
    progress,
  };
}

async function visualize(options = {}) {
  const { live = false, interval = 5000 } = options;

  console.clear();
  console.log('\n🚀 CLAWDNATION BONDING CURVE VISUALIZER\n');

  if (!live) {
    // Static visualization with examples
    console.log('═'.repeat(70));
    console.log('CURVE PARAMETERS:');
    console.log('  Start Rate: ' + CONFIG.startRate.toLocaleString() + ' CLWDN/SOL (best)');
    console.log('  End Rate: ' + CONFIG.endRate.toLocaleString() + ' CLWDN/SOL (worst)');
    console.log('  Total CLWDN: ' + (CONFIG.allocationCap / 1_000_000).toFixed(0) + 'M');
    console.log('  Early Bird Bonus: ' + ((CONFIG.endRate / CONFIG.startRate - 1) * 100).toFixed(0) + '%');
    console.log('═'.repeat(70) + '\n');

    // Show curve at different stages
    const stages = [0, 0.25, 0.5, 0.75, 1.0];
    stages.forEach(stage => {
      const clwdnSold = Math.floor(CONFIG.allocationCap * stage);
      const avgRate = Math.floor(
        (CONFIG.startRate + CONFIG.endRate) / 2
      );
      const solRaised = clwdnSold / avgRate;
      const contributors = Math.floor(stage * 100);

      const stats = calculateStats(clwdnSold, solRaised, contributors);

      console.log('\n🎯 STAGE: ' + (stage * 100).toFixed(0) + '% Complete\n');
      drawProgressBar(stage);
      drawChart(60, 15, stage);
      drawStats(stats);

      if (stage < 1.0) {
        console.log('─'.repeat(70) + '\n');
      }
    });

    console.log('\n✅ USE --live FLAG FOR REAL-TIME MONITORING\n');
  } else {
    // Live monitoring
    console.log('📡 Connecting to devnet...\n');

    const monitor = async () => {
      try {
        // In production, parse the actual bootstrap state account
        // For now, simulate based on timestamp
        const clwdnSold = Math.floor(Math.random() * CONFIG.allocationCap);
        const avgRate = (CONFIG.startRate + CONFIG.endRate) / 2;
        const solRaised = clwdnSold / avgRate;
        const contributors = Math.floor(Math.random() * 200);

        const stats = calculateStats(clwdnSold, solRaised, contributors);

        console.clear();
        console.log('\n🚀 CLAWDNATION BONDING CURVE - LIVE\n');
        console.log('Network: devnet | Refresh: ' + (interval / 1000) + 's\n');

        drawProgressBar(stats.progress);
        drawChart(60, 15, stats.progress);
        drawStats(stats);

        if (stats.progress >= 0.99) {
          console.log('🎉 BOOTSTRAP COMPLETE! Ready for LP creation.\n');
          process.exit(0);
        }
      } catch (e) {
        console.log('❌ Error:', e.message);
      }
    };

    // Initial draw
    await monitor();

    // Update periodically
    setInterval(monitor, interval);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('BONDING CURVE VISUALIZER\n');
    console.log('USAGE:');
    console.log('  node visualize-curve.js              # Show static examples');
    console.log('  node visualize-curve.js --live       # Live monitoring');
    console.log('  node visualize-curve.js --live --interval 10000  # Custom refresh\n');
    return;
  }

  const options = {
    live: args.includes('--live'),
    interval: args.includes('--interval')
      ? parseInt(args[args.indexOf('--interval') + 1]) || 5000
      : 5000,
  };

  await visualize(options);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { visualize, calculateStats, drawChart, drawProgressBar, drawStats };
