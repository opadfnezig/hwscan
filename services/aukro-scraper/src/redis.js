import Redis from 'ioredis';
import { REDIS_URL, SEEN_ID_LIMIT } from './config.js';

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

export function makeBullConnection() {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

const SEEN_KEY = 'aukro:seen_ids';

export async function isSeen(id) {
  const score = await redis.zscore(SEEN_KEY, String(id));
  return score !== null;
}

export async function markSeen(id) {
  const now = Date.now();
  await redis.zadd(SEEN_KEY, now, String(id));
  await redis.zremrangebyrank(SEEN_KEY, 0, -(SEEN_ID_LIMIT + 1));
}

export async function seenCount() {
  return redis.zcard(SEEN_KEY);
}

export async function getSnapshot(listingId) {
  const raw = await redis.get(`aukro:snap:${listingId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSnapshot(listingId, snapshot) {
  await redis.set(`aukro:snap:${listingId}`, JSON.stringify(snapshot), 'EX', 604800);
}

export async function deleteSnapshot(listingId) {
  await redis.del(`aukro:snap:${listingId}`);
}
