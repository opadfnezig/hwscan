import { redis } from './redis.js';
import { createLogger } from './observe.js';
import { startController } from './controller.js';

const log = createLogger('main');

try {
  await redis.connect();
  log.info('tori-scraper starting');
  await startController();
} catch (err) {
  log.error('fatal', { err: err.message, stack: err.stack });
  process.exit(1);
}
