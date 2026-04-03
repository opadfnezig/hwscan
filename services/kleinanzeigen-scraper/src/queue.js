import { Queue, Worker } from 'bullmq';
import { makeBullConnection } from './redis.js';
import { QUEUE_DISCOVER, QUEUE_RECHECK } from './config.js';

const connection = makeBullConnection();

export const discoverQueue = new Queue(QUEUE_DISCOVER, { connection });
export const recheckQueue  = new Queue(QUEUE_RECHECK,  { connection });

// Discover: stable jobId = dedup at BullMQ level (same URL won't re-queue if pending/active)
export async function enqueueDiscover(url) {
  const jobId = `d-${Buffer.from(url).toString('base64url')}`;
  return discoverQueue.add('scrape', { url, type: 'discover' }, { jobId });
}

// Recheck: no dedup — always enqueues
export async function enqueueRecheck(url) {
  return recheckQueue.add('scrape', { url, type: 'recheck' });
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
