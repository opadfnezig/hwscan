import Fastify from 'fastify';
import { CATEGORY_URLS, SCAN_INTERVAL_MS } from './config.js';
import { scrapeCategoryPage } from './scraper.js';
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
    platform: 'kleinanzeigen.de',
    seen_urls: seen,
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
  const { url, page = 1 } = req.body ?? {};
  if (!url) return reply.code(400).send({ error: 'url required' });
  reply.code(202).send({ status: 'accepted' });
  scanPage(url, page).catch(err => log.error('scan/page error', { err: err.message }));
});

app.post('/scan/listing', async (req, reply) => {
  const { url } = req.body ?? {};
  if (!url) return reply.code(400).send({ error: 'url required' });
  const job = await enqueueRecheck(url);
  return reply.code(202).send({ status: 'accepted', job_id: job.id });
});

// ─── Scanner ─────────────────────────────────────────────────────────────────

async function scanPage(baseUrl, pageNum = 1) {
  const { listings } = await scrapeCategoryPage(baseUrl, pageNum);
  let enqueued = 0;
  for (const { url } of listings) {
    if (await isSeen(url)) continue;
    await markSeen(url);
    await enqueueDiscover(url);
    enqueued++;
  }
  log.info(`scanned ${baseUrl} p${pageNum}: ${listings.length} found, ${enqueued} new`);
}

const trackedPoll = withPollTracking(async () => {
  for (const catUrl of CATEGORY_URLS) {
    await scanPage(catUrl, 1);
  }
}, log);

async function poll() {
  await trackedPoll().catch(() => {});
}

// ─── Start ───────────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info(`API listening on :3000`);
  log.info(`polling ${CATEGORY_URLS.length} categories every ${SCAN_INTERVAL_MS / 1000}s`);

  poll();
  setInterval(poll, SCAN_INTERVAL_MS);
}
