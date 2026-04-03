import { Queue } from 'bullmq';
import { makeBullConnection } from './redis.js';
import { QUEUE_DISCOVER, QUEUE_RECHECK } from './config.js';

const connection = makeBullConnection();

export const discoverQueue = new Queue(QUEUE_DISCOVER, { connection });
export const recheckQueue  = new Queue(QUEUE_RECHECK,  { connection });

// Discover: stable jobId deduplicates at BullMQ level (same listing won't re-queue if pending/active)
export async function enqueueDiscover(listingId, url) {
  const jobId = `d-${listingId}`;
  return discoverQueue.add('scrape', { listing_id: listingId, url, type: 'discover' }, { jobId });
}

// Recheck: no dedup — always enqueues
export async function enqueueRecheck(listingId, url) {
  return recheckQueue.add('scrape', { listing_id: listingId, url, type: 'recheck' });
}

export async function queueStats() {
  const [dw, da, rw, ra] = await Promise.all([
    discoverQueue.getWaitingCount(),
    discoverQueue.getActiveCount(),
    recheckQueue.getWaitingCount(),
    recheckQueue.getActiveCount(),
  ]);
  return { discover: { waiting: dw, active: da }, recheck: { waiting: rw, active: ra } };
}
