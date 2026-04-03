import { Queue } from 'bullmq';
import { makeBullConnection } from './redis.js';
import { QUEUE_DISCOVER, QUEUE_RECHECK } from './config.js';

const connection = makeBullConnection();

export const discoverQueue = new Queue(QUEUE_DISCOVER, { connection });
export const recheckQueue  = new Queue(QUEUE_RECHECK,  { connection });

export async function enqueueDiscover(listingId) {
  const jobId = `d-${listingId}`;
  return discoverQueue.add('scrape', { listing_id: String(listingId), type: 'discover' }, { jobId });
}

export async function enqueueRecheck(listingId) {
  return recheckQueue.add('scrape', { listing_id: String(listingId), type: 'recheck' });
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
