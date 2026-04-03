import Redis from 'ioredis';
import { REDIS_URL, SEEN_URL_LIMIT } from './config.js';

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });

export function makeBullConnection() {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

const SEEN_KEY = 'ka:seen_urls';

export async function isSeen(url) {
  const score = await redis.zscore(SEEN_KEY, url);
  return score !== null;
}

export async function markSeen(url) {
  const now = Date.now();
  await redis.zadd(SEEN_KEY, now, url);
  // Cap at SEEN_URL_LIMIT (remove oldest)
  await redis.zremrangebyrank(SEEN_KEY, 0, -(SEEN_URL_LIMIT + 1));
}

export async function seenCount() {
  return redis.zcard(SEEN_KEY);
}

// Snapshots: ka:snap:{listingId}
export async function getSnapshot(listingId) {
  const raw = await redis.get(`ka:snap:${listingId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSnapshot(listingId, snapshot) {
  await redis.set(`ka:snap:${listingId}`, JSON.stringify(snapshot), 'EX', 604800);
}

export async function deleteSnapshot(listingId) {
  await redis.del(`ka:snap:${listingId}`);
}
