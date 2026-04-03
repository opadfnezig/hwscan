import { Queue } from 'bullmq';
import { makeBullConnection } from './redis.js';
import { QUEUE_DISCOVER, QUEUE_RECHECK } from './config.js';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

export const discoverQueue = new Queue(QUEUE_DISCOVER, {
  connection: makeBullConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const recheckQueue = new Queue(QUEUE_RECHECK, {
  connection: makeBullConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// Enqueue a newly discovered listing URL.
// Uses a stable jobId so BullMQ deduplicates if already waiting/active.
export async function enqueueDiscover(url) {
  const jobId = `d-${Buffer.from(url).toString('base64url')}`;
  return discoverQueue.add('scrape', { url, type: 'discover' }, { jobId });
}

// Enqueue an explicit re-check — always adds, no dedup.
export async function enqueueRecheck(url) {
  return recheckQueue.add('scrape', { url, type: 'recheck' });
}

export async function getQueueStats() {
  const [dw, da, rw, ra] = await Promise.all([
    discoverQueue.getWaitingCount(),
    discoverQueue.getActiveCount(),
    recheckQueue.getWaitingCount(),
    recheckQueue.getActiveCount(),
  ]);
  return {
    discover: { waiting: dw, active: da },
    recheck: { waiting: rw, active: ra },
  };
}
