import Fastify from 'fastify';
import { createHash } from 'crypto';
import { CATEGORY_URLS, SCAN_INTERVAL_MS, SEEN_URL_LIMIT } from './config.js';
import { scrapeCategoryPage, scrapeListing } from './scraper.js';
import { downloadImages } from './downloader.js';
import { getSnapshot, saveSnapshot, deleteSnapshot } from './redis.js';
import { emit } from './kafka.js';
import { createLogger, healthState, withPollTracking } from './observe.js';

const log = createLogger('controller');
const app = Fastify({ logger: false });

function sha1(obj) {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

// ─── In-memory seen set ─────────────────────────────────────────────────

const seenUrls = new Set();

function isSeen(url) {
  return seenUrls.has(url);
}

function markSeen(url) {
  seenUrls.add(url);
  if (seenUrls.size > SEEN_URL_LIMIT) {
    const first = seenUrls.values().next().value;
    seenUrls.delete(first);
  }
}

// ─── Process a single listing (fetch, diff, emit) ───────────────────────

async function processListing(url) {
  log.info(`processing ${url}`);

  const result = await scrapeListing(url);

  if (result.deleted) {
    log.info('deleted', { url });
    const idMatch = url.match(/\/(\d+)-\d+-\d+/);
    if (idMatch) {
      await emit('listing.deleted', { listing_id: idMatch[1], url });
      await deleteSnapshot(idMatch[1]);
    }
    return;
  }

  const { data } = result;
  const { listing_id, image_urls } = data;

  const snapshot = await getSnapshot(listing_id);

  const newImageHash = sha1(image_urls);
  const newDataHash  = sha1({
    title:       data.title,
    price_raw:   data.price_raw,
    description: data.description,
    location:    data.location,
    params:      data.params,
  });

  const imagesChanged = !snapshot || snapshot.image_hash !== newImageHash;
  const dataChanged   = !snapshot || snapshot.data_hash  !== newDataHash;

  let image_paths = snapshot?.image_paths || [];
  if (imagesChanged && image_urls.length > 0) {
    image_paths = await downloadImages(listing_id, image_urls);
  }

  const payload = {
    ...data,
    image_paths,
    images_changed: imagesChanged,
  };

  if (!snapshot) {
    await emit('listing.new', payload);
    log.info('new listing', { listing_id, title: data.title });
  } else if (dataChanged || imagesChanged) {
    const changed_fields = [];
    if (snapshot.title       !== data.title)       changed_fields.push('title');
    if (snapshot.price_raw   !== data.price_raw)   changed_fields.push('price');
    if (snapshot.description !== data.description) changed_fields.push('description');
    if (snapshot.location    !== data.location)    changed_fields.push('location');
    if (sha1(snapshot.params ?? {}) !== sha1(data.params)) changed_fields.push('params');
    if (imagesChanged) changed_fields.push('images');
    await emit('listing.changed', { ...payload, changed_fields });
    log.info('changed', { listing_id, fields: changed_fields });
  }

  await saveSnapshot(listing_id, {
    title:       data.title,
    price_raw:   data.price_raw,
    description: data.description,
    location:    data.location,
    params:      data.params,
    image_hash:  newImageHash,
    data_hash:   newDataHash,
    image_paths,
    last_seen:   new Date().toISOString(),
  });
}

// ─── Poll category pages ────────────────────────────────────────────────

async function poll() {
  for (const catUrl of CATEGORY_URLS) {
    const { listings } = await scrapeCategoryPage(catUrl, 1);
    let processed = 0;

    for (const { url } of listings) {
      if (isSeen(url)) continue;
      markSeen(url);

      try {
        await processListing(url);
        processed++;
      } catch (err) {
        log.error('process failed', { url, err: err.message });
      }
    }

    log.info(`scanned ${catUrl}: ${listings.length} found, ${processed} new`);
  }
}

const trackedPoll = withPollTracking(() => poll(), log);

// ─── HTTP API ───────────────────────────────────────────────────────────

app.get('/health', async (req, reply) => {
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return reply.code(degraded ? 503 : 200).send({
    status: degraded ? 'degraded' : 'ok',
    platform: 'kleinanzeigen.de',
    seen_urls: seenUrls.size,
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
  (async () => {
    try {
      const { listings } = await scrapeCategoryPage(url, page);
      for (const item of listings) {
        markSeen(item.url);
        await processListing(item.url).catch(err =>
          log.error('process failed', { url: item.url, err: err.message })
        );
      }
    } catch (err) {
      log.error('scan/page error', { err: err.message });
    }
  })();
});

app.post('/scan/listing', async (req, reply) => {
  const { url } = req.body ?? {};
  if (!url) return reply.code(400).send({ error: 'url required' });
  reply.code(202).send({ status: 'accepted', url });
  processListing(url).catch(err => log.error('recheck failed', { url, err: err.message }));
});

// ─── Start ──────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info('listening on :3000 (kleinanzeigen.de)');
  log.info(`polling ${CATEGORY_URLS.length} categories every ${SCAN_INTERVAL_MS / 1000}s`);

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
