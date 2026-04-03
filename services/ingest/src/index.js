import { runMigrations, pool } from './db.js';
import { startConsumer, stopConsumer } from './consumer.js';
import { startRecheck } from './recheck.js';

const log = (level, msg, extra) =>
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, component: 'main', msg, ...extra }) + '\n');

async function main() {
  log('info', 'starting ingest service');

  await runMigrations();
  log('info', 'migrations applied');

  await startConsumer();
  log('info', 'consumer running');

  startRecheck();
  log('info', 'recheck scheduler started');

  const shutdown = async () => {
    log('info', 'shutting down');
    await stopConsumer();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

// Prevent EPIPE from AWS SDK socket errors crashing the process
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    log('warn', 'EPIPE (ignored)', { err: err.message });
    return;
  }
  log('error', 'uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1);
});

main().catch(err => {
  log('error', 'fatal', { err: err.message, stack: err.stack });
  process.exit(1);
});
