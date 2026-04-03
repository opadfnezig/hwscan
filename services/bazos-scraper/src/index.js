import { ROLE } from './config.js';
import { redis } from './redis.js';
import { createLogger } from './observe.js';

const log = createLogger('main');

async function main() {
  log.info(`starting role=${ROLE}`);

  await redis.connect();
  log.info('redis connected');

  if (ROLE === 'controller') {
    const { startController } = await import('./controller.js');
    await startController();
  } else if (ROLE === 'worker') {
    const { startWorker } = await import('./worker.js');
    startWorker();
  } else {
    log.error(`unknown ROLE="${ROLE}", expected controller|worker`);
    process.exit(1);
  }
}

main().catch(err => {
  log.error('fatal', { err: err.message, stack: err.stack });
  process.exit(1);
});
