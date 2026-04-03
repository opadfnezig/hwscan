import Redis from 'ioredis';
import { REDIS_URL } from './config.js';

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

export async function getSnapshot(listingId) {
  const raw = await redis.get(`tori:snap:${listingId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSnapshot(listingId, snapshot) {
  await redis.set(`tori:snap:${listingId}`, JSON.stringify(snapshot), 'EX', 604800);
}

export async function deleteSnapshot(listingId) {
  await redis.del(`tori:snap:${listingId}`);
}
