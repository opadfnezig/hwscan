export const REDIS_URL          = process.env.REDIS_URL || 'redis://localhost:6379';
export const KAFKA_BROKERS      = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const KAFKA_TOPIC        = process.env.KAFKA_TOPIC || 'olx.listings';
export const SCAN_INTERVAL_MS   = parseInt(process.env.SCAN_INTERVAL_MS || '600000', 10);
export const IMAGES_DIR         = process.env.IMAGES_DIR || '/data/images';
export const SEEN_ID_LIMIT      = parseInt(process.env.SEEN_ID_LIMIT || '5000', 10);
export const ANTHILL_URL        = process.env.ANTHILL_URL || 'http://localhost:3100';

// Domain: 'olx.ua' or 'olx.pl'
export const DOMAIN = process.env.DOMAIN || 'olx.ua';

// Category ID to poll:
//   olx.ua → 38  (Комп'ютери та комплектуючі / Computers & Components)
//   olx.pl → 443 (Komputery)
export const CATEGORY_ID = parseInt(
  process.env.CATEGORY_ID || (DOMAIN === 'olx.ua' ? '38' : '443'),
  10,
);

export const API_BASE = `https://www.${DOMAIN}/api/v1`;
