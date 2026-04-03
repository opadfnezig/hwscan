export const REDIS_URL          = process.env.REDIS_URL || 'redis://localhost:6379';
export const KAFKA_BROKERS      = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const KAFKA_TOPIC        = process.env.KAFKA_TOPIC || 'aukro.listings';
export const SCAN_INTERVAL_MS   = parseInt(process.env.SCAN_INTERVAL_MS || '600000', 10);
export const IMAGES_DIR         = process.env.IMAGES_DIR || '/data/images';
export const SEEN_ID_LIMIT      = parseInt(process.env.SEEN_ID_LIMIT || '5000', 10);
export const ANTHILL_URL        = process.env.ANTHILL_URL || 'http://localhost:3100';

// Category SEO URL for search
export const CATEGORY_SEO_URL   = process.env.CATEGORY_SEO_URL || 'pocitace-a-hry';
export const API_BASE           = 'https://aukro.cz/backend-web/api';

export const QUEUE_DISCOVER = 'aukro/discover';
export const QUEUE_RECHECK  = 'aukro/recheck';
