import { redis } from './redis.js';
import { createLogger } from './observe.js';
import { startController } from './controller.js';
import { DOMAIN } from './config.js';

const log = createLogger('main');

try {
  await redis.connect();
  log.info(`olx-scraper starting (${DOMAIN})`);
  await startController();
} catch (err) {
  log.error('fatal', { err: err.message, stack: err.stack });
  process.exit(1);
}
