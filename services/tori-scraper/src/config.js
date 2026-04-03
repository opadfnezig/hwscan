import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxiesPath = join(__dirname, '..', 'proxies.json');

export const ROLE               = process.env.ROLE || 'controller';
export const PROXY_INDEX        = parseInt(process.env.PROXY_INDEX || '0', 10);
export const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);
export const REDIS_URL          = process.env.REDIS_URL || 'redis://localhost:6379';
export const KAFKA_BROKERS      = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const KAFKA_TOPIC        = process.env.KAFKA_TOPIC || 'tori.listings';
export const SCAN_INTERVAL_MS   = parseInt(process.env.SCAN_INTERVAL_MS || '600000', 10);
export const IMAGES_DIR         = process.env.IMAGES_DIR || '/data/images';
export const SEEN_ID_LIMIT      = parseInt(process.env.SEEN_ID_LIMIT || '5000', 10);

// Category: sub_category=1.93.3215 = Tietotekniikka (IT / Computers)
export const CATEGORY_PARAM     = process.env.CATEGORY_PARAM || 'sub_category=1.93.3215';
export const BASE_URL           = 'https://www.tori.fi';

export const QUEUE_DISCOVER = 'tori/discover';
export const QUEUE_RECHECK  = 'tori/recheck';

export const PROXIES = JSON.parse(readFileSync(proxiesPath, 'utf-8'));
export const PROXY   = PROXIES[PROXY_INDEX % PROXIES.length];
