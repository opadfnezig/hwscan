import Redis from 'ioredis';
import { REDIS_URL, DOMAIN } from './config.js';

const PREFIX = `olx_${DOMAIN.replace('.', '_')}`;

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

// Snapshots: {PREFIX}:snap:{listingId}
export async function getSnapshot(listingId) {
  const raw = await redis.get(`${PREFIX}:snap:${listingId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSnapshot(listingId, snapshot) {
  await redis.set(`${PREFIX}:snap:${listingId}`, JSON.stringify(snapshot), 'EX', 604800);
}

export async function deleteSnapshot(listingId) {
  await redis.del(`${PREFIX}:snap:${listingId}`);
}
