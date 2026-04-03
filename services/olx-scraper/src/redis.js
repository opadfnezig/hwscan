import Redis from 'ioredis';
import { REDIS_URL, SEEN_ID_LIMIT, DOMAIN } from './config.js';

const PREFIX = `olx_${DOMAIN.replace('.', '_')}`;

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

export function makeBullConnection() {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

const SEEN_KEY = `${PREFIX}:seen_ids`;

export async function isSeen(id) {
  const score = await redis.zscore(SEEN_KEY, String(id));
  return score !== null;
}

export async function markSeen(id) {
  const now = Date.now();
  await redis.zadd(SEEN_KEY, now, String(id));
  // Cap at SEEN_ID_LIMIT (remove oldest)
  await redis.zremrangebyrank(SEEN_KEY, 0, -(SEEN_ID_LIMIT + 1));
}

export async function seenCount() {
  return redis.zcard(SEEN_KEY);
}

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
