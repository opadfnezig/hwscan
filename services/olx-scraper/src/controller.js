import Fastify from 'fastify';
import { SCAN_INTERVAL_MS, DOMAIN, CATEGORY_ID } from './config.js';
import { fetchCategoryPage } from './client.js';
import { isSeen, markSeen, seenCount } from './redis.js';
import { enqueueDiscover, enqueueRecheck, queueStats } from './queue.js';
import { createLogger, healthState, withPollTracking } from './observe.js';

const log = createLogger('controller');
const app = Fastify({ logger: false });

// ─── API ─────────────────────────────────────────────────────────────────────

app.get('/health', async (req, reply) => {
  const [seen, queues] = await Promise.all([seenCount(), queueStats()]);
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return reply.code(degraded ? 503 : 200).send({
    status: degraded ? 'degraded' : 'ok',
    platform: DOMAIN,
    category_id: CATEGORY_ID,
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
  reply.code(202).send({ status: 'accepted' });
  trackedPoll().catch(() => {});
});

app.post('/scan/listing', async (req, reply) => {
  const { listing_id, url } = req.body ?? {};
  if (!listing_id || !url) return reply.code(400).send({ error: 'listing_id and url required' });
  const job = await enqueueRecheck(listing_id, url);
  return reply.code(202).send({ status: 'accepted', job_id: job.id });
});

// ─── Scanner ─────────────────────────────────────────────────────────────────

async function poll() {
  let enqueued = 0;
  let seenCount_ = 0;

  const { listings } = await fetchCategoryPage(0, 50);

  for (const { id, url } of listings) {
    if (await isSeen(id)) {
      seenCount_++;
      if (seenCount_ >= 10) break;
      continue;
    }
    seenCount_ = 0;
    await markSeen(id);
    await enqueueDiscover(id, url);
    enqueued++;
  }

  log.info(`poll ${DOMAIN} cat=${CATEGORY_ID}: ${listings.length} fetched, ${enqueued} new`);
}

const trackedPoll = withPollTracking(poll, log);

// ─── Start ───────────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info(`API listening on :3000 (${DOMAIN} category=${CATEGORY_ID})`);
  log.info(`polling every ${SCAN_INTERVAL_MS / 1000}s`);

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
