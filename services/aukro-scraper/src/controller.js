import Fastify from 'fastify';
import { SCAN_INTERVAL_MS, CATEGORY_SEO_URL } from './config.js';
import { fetchCategoryPage } from './client.js';
import { isSeen, markSeen, seenCount } from './redis.js';
import { enqueueDiscover, enqueueRecheck, queueStats } from './queue.js';
import { createLogger, healthState, withPollTracking } from './observe.js';

const log = createLogger('controller');
const app = Fastify({ logger: false });

app.get('/health', async (req, reply) => {
  const [seen, queues] = await Promise.all([seenCount(), queueStats()]);
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return reply.code(degraded ? 503 : 200).send({
    status: degraded ? 'degraded' : 'ok',
    platform: 'aukro.cz',
    category: CATEGORY_SEO_URL,
    seen_ids: seen,
    queues,
    errors_total: healthState.errors,
    consecutive_fails: healthState.consecutiveFails,
    poll_errors: healthState.pollErrors,
    last_success: healthState.lastSuccess,
    last_error: healthState.lastError,
    uptime_s: Math.floor(process.uptime()),
  });
});

app.post('/scan/page', async (req, reply) => {
  const page = parseInt(req.body?.page ?? req.query?.page ?? '0', 10);
  reply.code(202).send({ status: 'accepted', page });
  trackedPollPage(page).catch(() => {});
});

app.post('/scan/listing', async (req, reply) => {
  const { listing_id } = req.body ?? {};
  if (!listing_id) return reply.code(400).send({ error: 'listing_id required' });
  const job = await enqueueRecheck(listing_id);
  return reply.code(202).send({ status: 'accepted', job_id: job.id });
});

async function poll(pageNum = 0) {
  const { listings, totalElements } = await fetchCategoryPage(pageNum, 60);
  let enqueued = 0;
  let seenRun = 0;

  for (const { id } of listings) {
    if (await isSeen(id)) {
      seenRun++;
      if (seenRun >= 10) break;
      continue;
    }
    seenRun = 0;
    await markSeen(id);
    await enqueueDiscover(id);
    enqueued++;
  }

  log.info(`page ${pageNum}: ${listings.length} fetched (${totalElements} total), ${enqueued} new`);
}

const trackedPoll = withPollTracking(() => poll(0), log);
const trackedPollPage = (page) => withPollTracking(() => poll(page), log)();

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info('API listening on :3000 (aukro.cz)');

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
