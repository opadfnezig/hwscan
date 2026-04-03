import Redis from 'ioredis';
import { REDIS_URL, DOMAIN_SUFFIX } from './config.js';

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

// ─── Listing snapshots ─────────────────────────────────────────────────────
const SNAP_PREFIX = `bazos_${DOMAIN_SUFFIX}:snap:`;

export async function getSnapshot(listingId) {
  const raw = await redis.get(SNAP_PREFIX + listingId);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSnapshot(listingId, snapshot) {
  await redis.set(SNAP_PREFIX + listingId, JSON.stringify(snapshot), 'EX', 604800);
}

export async function deleteSnapshot(listingId) {
  await redis.del(SNAP_PREFIX + listingId);
}
