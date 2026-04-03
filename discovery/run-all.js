import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const platforms = [
  { name: 'Bazos.cz', script: 'discovery/bazos.js', priority: 1 },
  { name: 'Bazos.sk', script: 'discovery/bazossk.js', priority: 2 },
  { name: 'Tori.fi', script: 'discovery/tori.js', priority: 3 },
  { name: 'OLX.ua', script: 'discovery/olx.js', priority: 4 },
  { name: 'OLX.pl', script: 'discovery/olxpl.js', priority: 5 },
  { name: 'Kleinanzeigen.de', script: 'discovery/kleinanzeigen.js', priority: 6 },
  { name: 'Aukro.cz', script: 'discovery/aukro.js', priority: 7 }
];

const results = {
  startTime: new Date().toISOString(),
  platforms: [],
  endTime: null,
  totalDuration: null
};

function runScript(script, name) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Running ${name}...`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();
    const child = spawn('node', [script], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const result = {
        platform: name,
        script,
        exitCode: code,
        duration,
        success: code === 0
      };

      results.platforms.push(result);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`${code === 0 ? '✅' : '❌'} ${name} finished (${(duration / 1000).toFixed(1)}s)`);
      console.log(`${'='.repeat(60)}\n`);

      resolve(result);
    });

    child.on('error', (error) => {
      console.error(`\n❌ Error running ${name}:`, error.message);
      results.platforms.push({
        platform: name,
        script,
        error: error.message,
        success: false
      });
      resolve({ success: false, error: error.message });
    });
  });
}

async function runAll() {
  const overallStart = Date.now();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║        HW5C4N - Hardware Marketplace Discovery             ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nStarting discovery for ${platforms.length} platforms...\n`);

  // Run each platform sequentially (to avoid rate limiting issues)
  for (const platform of platforms) {
    await runScript(platform.script, platform.name);

    // Wait between platforms
    if (platforms.indexOf(platform) < platforms.length - 1) {
      console.log('\n⏳ Waiting 3 seconds before next platform...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  const overallDuration = Date.now() - overallStart;
  results.endTime = new Date().toISOString();
  results.totalDuration = overallDuration;

  // Print summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    DISCOVERY SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  results.platforms.forEach(p => {
    const icon = p.success ? '✅' : '❌';
    const duration = p.duration ? `${(p.duration / 1000).toFixed(1)}s` : 'N/A';
    console.log(`${icon} ${p.platform.padEnd(20)} - ${duration.padStart(8)} ${p.error ? `(${p.error})` : ''}`);
  });

  console.log('');
  console.log(`Total time: ${(overallDuration / 1000).toFixed(1)}s`);
  console.log(`Success rate: ${results.platforms.filter(p => p.success).length}/${results.platforms.length}`);
  console.log('');

  // Write summary JSON
  writeFileSync('discovery/run-summary.json', JSON.stringify(results, null, 2));
  console.log('📊 Summary saved to discovery/run-summary.json');

  console.log('\n📁 Generated files:');
  console.log('   - discovery/BAZOS-FINDINGS.md');
  console.log('   - discovery/BAZOSSK-FINDINGS.md');
  console.log('   - discovery/TORI-FINDINGS.md');
  console.log('   - discovery/OLX-FINDINGS.md');
  console.log('   - discovery/OLXPL-FINDINGS.md');
  console.log('   - discovery/KLEINANZEIGEN-FINDINGS.md');
  console.log('   - discovery/AUKRO-FINDINGS.md');
  console.log('   - discovery/samples/ (HTML samples)');

  console.log('\n✅ All discovery scripts completed!');
  console.log('   Next step: Review findings and create comprehensive DISCOVERY.md\n');

  // Exit with error if any platform failed
  const anyFailed = results.platforms.some(p => !p.success);
  process.exit(anyFailed ? 1 : 0);
}

runAll().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
