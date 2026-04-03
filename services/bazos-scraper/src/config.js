export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'bazos.cz.listings';
export const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'bazos-scraper';

export const BASE_URL = process.env.BASE_URL || 'https://pc.bazos.cz/';
export const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '600000', 10);
export const IMAGES_DIR = process.env.IMAGES_DIR || '/data/images';
export const SEEN_ID_LIMIT = parseInt(process.env.SEEN_ID_LIMIT || '2000', 10);
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
export const ANTHILL_URL = process.env.ANTHILL_URL || 'http://localhost:3100';

// Derive domain suffix from BASE_URL: 'cz' or 'sk'
export const DOMAIN_SUFFIX = BASE_URL.includes('bazos.sk') ? 'sk' : 'cz';
