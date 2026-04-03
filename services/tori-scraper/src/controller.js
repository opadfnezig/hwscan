import Fastify from 'fastify';
import { SCAN_INTERVAL_MS, CATEGORY_PARAM } from './config.js';
import { scrapeCategoryPage } from './scraper.js';
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
    platform: 'tori.fi',
    category: CATEGORY_PARAM,
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
  const page = parseInt(req.body?.page ?? req.query?.page ?? '1', 10);
  reply.code(202).send({ status: 'accepted', page });
  trackedPollPage(page).catch(() => {});
});

app.post('/scan/listing', async (req, reply) => {
  const { listing_id, url } = req.body ?? {};
  if (!listing_id || !url) return reply.code(400).send({ error: 'listing_id and url required' });
  const job = await enqueueRecheck(listing_id, url);
  return reply.code(202).send({ status: 'accepted', job_id: job.id });
});

async function poll(pageNum = 1) {
  const { listings } = await scrapeCategoryPage(pageNum);
  let enqueued = 0;
  let seenRun = 0;

  for (const { id, url } of listings) {
    if (await isSeen(id)) {
      seenRun++;
      if (seenRun >= 10) break;
      continue;
    }
    seenRun = 0;
    await markSeen(id);
    await enqueueDiscover(id, url);
    enqueued++;
  }

  log.info(`page ${pageNum}: ${listings.length} fetched, ${enqueued} new`);
}

const trackedPoll = withPollTracking(() => poll(1), log);
const trackedPollPage = (page) => withPollTracking(() => poll(page), log)();

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info('API listening on :3000 (tori.fi)');

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
