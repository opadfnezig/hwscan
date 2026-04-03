import { ROLE, DOMAIN } from './config.js';
import { redis } from './redis.js';
import { createLogger } from './observe.js';

const log = createLogger('main');

try {
  await redis.connect();
  log.info(`olx-scraper starting as ${ROLE} (${DOMAIN})`);

  if (ROLE === 'controller') {
    const { startController } = await import('./controller.js');
    await startController();
  } else {
    const { startWorker } = await import('./worker.js');
    startWorker();
  }
} catch (err) {
  log.error('fatal', { err: err.message, stack: err.stack });
  process.exit(1);
}
