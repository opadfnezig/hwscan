export const PG_URL        = process.env.PG_URL || 'postgresql://hw5c4n:hw5c4n@172.16.17.3:5432/hw5c4n';
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || '172.16.17.3:9092').split(',');
export const KAFKA_GROUP   = process.env.KAFKA_GROUP || 'ingest-v1';
export const KAFKA_TOPICS  = (process.env.KAFKA_TOPICS ||
  'bazos.cz.listings,bazos.sk.listings,kleinanzeigen.listings,olx.ua.listings,olx.pl.listings,tori.listings,aukro.listings'
).split(',').map(t => t.trim()).filter(Boolean);

// Recheck scheduler
export const RECHECK_INTERVAL_H  = parseInt(process.env.RECHECK_INTERVAL_H || '24', 10);
export const RECHECK_BATCH_SIZE  = parseInt(process.env.RECHECK_BATCH_SIZE || '5', 10);
export const SCRAPER_HOST        = process.env.SCRAPER_HOST || '172.16.5.13';

// Garage S3
export const S3_ENDPOINT   = process.env.S3_ENDPOINT || '';
export const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
export const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';
export const S3_BUCKET     = process.env.S3_BUCKET || 'hw5c4n-images';
export const S3_REGION     = process.env.S3_REGION || 'garage';
