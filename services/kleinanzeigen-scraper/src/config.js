import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxiesPath = join(__dirname, '..', 'proxies.json');

export const ROLE             = process.env.ROLE || 'controller';
export const PROXY_INDEX      = parseInt(process.env.PROXY_INDEX || '0', 10);
export const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);
export const REDIS_URL        = process.env.REDIS_URL || 'redis://localhost:6379';
export const KAFKA_BROKERS    = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const KAFKA_TOPIC      = process.env.KAFKA_TOPIC || 'kleinanzeigen.listings';
export const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '600000', 10);
export const IMAGES_DIR       = process.env.IMAGES_DIR || '/data/images';
export const SEEN_URL_LIMIT   = parseInt(process.env.SEEN_URL_LIMIT || '5000', 10);

export const CATEGORY_URLS = (
  process.env.CATEGORY_URLS ||
  'https://www.kleinanzeigen.de/s-pc-zubehoer-software/c225 https://www.kleinanzeigen.de/s-pcs/c228'
).trim().split(/\s+/);

// Pagination: insert /seite:N/ before the category segment (cNNN at end)
export function categoryPageUrl(baseUrl, pageNum) {
  if (pageNum <= 1) return baseUrl;
  // e.g. https://www.kleinanzeigen.de/s-pcs/c228
  //   → https://www.kleinanzeigen.de/s-pcs/seite:2/c228
  return baseUrl.replace(/(\/c\d+)$/, `/seite:${pageNum}$1`);
}

export const QUEUE_DISCOVER = 'ka/discover';
export const QUEUE_RECHECK  = 'ka/recheck';

export const PROXIES = JSON.parse(readFileSync(proxiesPath, 'utf-8'));
export const PROXY   = PROXIES[PROXY_INDEX % PROXIES.length];
