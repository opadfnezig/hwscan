import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROLE = process.env.ROLE || 'controller'; // 'controller' | 'worker'
export const PROXY_INDEX = parseInt(process.env.PROXY_INDEX || '0', 10);
export const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);

export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'bazos.listings';
export const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'bazos-scraper';

export const BASE_URL = process.env.BASE_URL || 'https://pc.bazos.cz/';
export const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '600000', 10);
export const IMAGES_DIR = process.env.IMAGES_DIR || '/data/images';
export const SEEN_URL_LIMIT = parseInt(process.env.SEEN_URL_LIMIT || '1000', 10);
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);

// Derive domain suffix from BASE_URL: 'cz' or 'sk'
export const DOMAIN_SUFFIX = BASE_URL.includes('bazos.sk') ? 'sk' : 'cz';

export const QUEUE_DISCOVER = `bazos_${DOMAIN_SUFFIX}/discover`;
export const QUEUE_RECHECK  = `bazos_${DOMAIN_SUFFIX}/recheck`;

const proxiesPath = join(__dirname, '..', 'proxies.json');
export const PROXIES = JSON.parse(readFileSync(proxiesPath, 'utf-8'));
export const PROXY = PROXIES[PROXY_INDEX % PROXIES.length];
