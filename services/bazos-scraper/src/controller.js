import Fastify from 'fastify';
import { isSeen, markSeen, getSeenCount } from './redis.js';
import { enqueueDiscover, enqueueRecheck, getQueueStats } from './queue.js';
import { scrapeCategoryPage } from './scraper.js';
import { HTTP_PORT, SCAN_INTERVAL_MS, BASE_URL } from './config.js';
import { createLogger, healthState, withPollTracking } from './observe.js';

const log = createLogger('controller');

// Fetch a category page, deduplicate against seen-set, push new URLs to discover queue.
async function scanPage(pageNum) {
  const { urls } = await scrapeCategoryPage(pageNum);

  let newCount = 0;
  for (const url of urls) {
    if (!(await isSeen(url))) {
      await markSeen(url);
      await enqueueDiscover(url);
      newCount++;
    }
  }

  log.info(`page ${pageNum}: ${urls.length} found, ${newCount} new`);
  return { total: urls.length, new: newCount, page: pageNum };
}

export async function startController() {
  const app = Fastify({ logger: { level: 'warn' } });

  // ── Health ──────────────────────────────────────────────────────────────
  app.get('/health', async (req, reply) => {
    const [seenUrls, queues] = await Promise.all([getSeenCount(), getQueueStats()]);
    const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
    return reply.code(degraded ? 503 : 200).send({
      status: degraded ? 'degraded' : 'ok',
      platform: BASE_URL.includes('bazos.sk') ? 'bazos.sk' : 'bazos.cz',
      base_url: BASE_URL,
      seen_urls: seenUrls,
      queues,
      errors_total: healthState.errors,
      consecutive_fails: healthState.consecutiveFails,
      poll_errors: healthState.pollErrors,
      last_success: healthState.lastSuccess,
      last_error: healthState.lastError,
      uptime_s: Math.floor(process.uptime()),
    });
  });

  // ── Scan a category page (respects seen-set dedup) ───────────────────────
  app.post('/scan/page', async (req, reply) => {
    const page = parseInt(req.body?.page ?? req.query?.page ?? '1', 10);
    if (!page || page < 1) return reply.code(400).send({ error: 'page must be a positive integer' });

    reply.code(202).send({ accepted: true, page });
    scanPage(page).catch(err => log.error(`scan page ${page} error`, { err: err.message }));
  });

  // ── Push a single listing URL directly to recheck queue (no dedup) ──────
  app.post('/scan/listing', async (req, reply) => {
    const { url } = req.body ?? {};
    if (!url || !url.includes('/inzerat/')) {
      return reply.code(400).send({ error: 'url must be a bazos /inzerat/ URL' });
    }
    const job = await enqueueRecheck(url);
    return reply.code(202).send({ accepted: true, job_id: job.id });
  });

  await app.listen({ port: HTTP_PORT, host: '0.0.0.0' });
  log.info(`API on :${HTTP_PORT}`);

  // ── Periodic poller ──────────────────────────────────────────────────────
  const trackedPoll = withPollTracking(() => scanPage(1), log);
  const poll = () => trackedPoll().catch(() => {}); // error already logged by tracker

  poll();
  setInterval(poll, SCAN_INTERVAL_MS);
  log.info(`poller running every ${SCAN_INTERVAL_MS / 1000}s on ${BASE_URL}`);
}
