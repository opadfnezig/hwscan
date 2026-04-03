import Redis from 'ioredis';
import { REDIS_URL, SEEN_URL_LIMIT, DOMAIN_SUFFIX } from './config.js';

// General-purpose client (state, snapshots, seen-URL set)
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Dedicated BullMQ connection — maxRetriesPerRequest: null required by BullMQ
export function makeBullConnection() {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

// ─── Seen-URL ring buffer ──────────────────────────────────────────────────
// Sorted set keyed by URL, score = timestamp. Capped at SEEN_URL_LIMIT.
const SEEN_KEY = `bazos_${DOMAIN_SUFFIX}:seen_urls`;

export async function isSeen(url) {
  const score = await redis.zscore(SEEN_KEY, url);
  return score !== null;
}

export async function markSeen(url) {
  const now = Date.now();
  await redis.zadd(SEEN_KEY, now, url);
  // Evict oldest entries beyond the limit
  await redis.zremrangebyrank(SEEN_KEY, 0, -(SEEN_URL_LIMIT + 1));
}

export async function getSeenCount() {
  return redis.zcard(SEEN_KEY);
}

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
