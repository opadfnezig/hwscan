import Fastify from 'fastify';
import { createHash } from 'crypto';
import { HTTP_PORT, SCAN_INTERVAL_MS, BASE_URL, SEEN_ID_LIMIT, DOMAIN_SUFFIX } from './config.js';
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

// ─── In-memory seen set (no Redis/BullMQ needed) ────────────────────────

const seenIds = new Set();

function isSeen(id) {
  return seenIds.has(String(id));
}

function markSeen(id) {
  seenIds.add(String(id));
  if (seenIds.size > SEEN_ID_LIMIT) {
    const first = seenIds.values().next().value;
    seenIds.delete(first);
  }
}

// ─── Process a single listing (fetch, diff, emit) ────────────────────────

function changedFields(snapshot, data) {
  const fields = [];
  if (data.title       !== snapshot.title)       fields.push('title');
  if (data.price_raw   !== snapshot.price_raw)   fields.push('price');
  if (data.description !== snapshot.description) fields.push('description');
  if (data.location    !== snapshot.location)    fields.push('location');
  return fields;
}

async function processListing(url) {
  const listingId = url.match(/\/inzerat\/(\d+)\//)?.[1];
  log.info(`processing ${listingId}`, { url });

  const result = await scrapeListing(url);

  // ── Deleted ──────────────────────────────────────────────────────────────
  if (result.deleted) {
    const snapshot = await getSnapshot(listingId);
    if (snapshot) {
      await emit('listing.deleted', {
        listing_id: listingId,
        url,
        last_known: {
          title: snapshot.title,
          price_raw: snapshot.price_raw,
          location: snapshot.location,
        },
      });
      await deleteSnapshot(listingId);
      log.info('deleted', { listing_id: listingId });
    } else {
      log.info('deleted (no snapshot)', { listing_id: listingId });
    }
    return;
  }

  const { data } = result;
  const snapshot = await getSnapshot(data.listing_id);

  const newImageHash = sha1(data.image_urls);
  const newDataHash  = sha1({
    title:       data.title,
    price_raw:   data.price_raw,
    description: data.description,
    location:    data.location,
  });

  const imagesChanged = !snapshot || snapshot.image_hash !== newImageHash;
  const dataChanged   = !snapshot || snapshot.data_hash  !== newDataHash;

  // ── Download images if first time or image set changed ───────────────────
  let imagePaths = snapshot?.image_paths ?? [];
  if (imagesChanged && data.image_urls.length > 0) {
    log.info(`downloading ${data.image_urls.length} images`, { listing_id: data.listing_id });
    imagePaths = await downloadImages(data.listing_id, data.image_urls);
  }

  const payload = {
    listing_id:  data.listing_id,
    url:         data.url,
    title:       data.title,
    price_raw:   data.price_raw,
    description: data.description,
    seller_name: data.seller_name,
    location:    data.location,
    views:       data.views,
    posted_at:   data.posted_at,
    image_paths: imagePaths,
    images_changed: imagesChanged,
  };

  // ── Emit Kafka event ──────────────────────────────────────────────────────
  if (!snapshot) {
    await emit('listing.new', payload);
    log.info('new listing', { listing_id: data.listing_id, title: data.title });
  } else if (dataChanged || imagesChanged) {
    payload.changed_fields = [
      ...changedFields(snapshot, data),
      ...(imagesChanged ? ['images'] : []),
    ];
    await emit('listing.changed', payload);
    log.info('changed', { listing_id: data.listing_id, fields: payload.changed_fields });
  }

  // ── Persist snapshot ──────────────────────────────────────────────────────
  await saveSnapshot(data.listing_id, {
    title:       data.title,
    price_raw:   data.price_raw,
    description: data.description,
    location:    data.location,
    seller_name: data.seller_name,
    views:       data.views,
    posted_at:   data.posted_at,
    image_hash:  newImageHash,
    data_hash:   newDataHash,
    image_paths: imagePaths,
    last_seen:   new Date().toISOString(),
  });
}

// ─── Poll category page ──────────────────────────────────────────────────

async function poll(pageNum = 1) {
  const { urls } = await scrapeCategoryPage(pageNum);
  let processed = 0;
  let seenRun = 0;

  for (const url of urls) {
    const id = url.match(/\/inzerat\/(\d+)\//)?.[1];
    if (!id) continue;

    if (isSeen(id)) {
      seenRun++;
      if (seenRun >= 10) break;
      continue;
    }
    seenRun = 0;
    markSeen(id);

    try {
      await processListing(url);
      processed++;
    } catch (err) {
      log.error('process failed', { listing_id: id, err: err.message });
    }
  }

  log.info(`page ${pageNum}: ${urls.length} found, ${processed} new`);
}

const trackedPoll = withPollTracking(() => poll(1), log);

// ─── HTTP API ───────────────────────────────────────────────────────────

const platform = DOMAIN_SUFFIX === 'sk' ? 'bazos.sk' : 'bazos.cz';

app.get('/health', async () => {
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return {
    status: degraded ? 'degraded' : 'ok',
    platform,
    base_url: BASE_URL,
    seen_ids: seenIds.size,
    errors_total: healthState.errors,
    consecutive_fails: healthState.consecutiveFails,
    poll_errors: healthState.pollErrors,
    last_success: healthState.lastSuccess,
    last_error: healthState.lastError,
    uptime_s: Math.floor(process.uptime()),
  };
});

app.post('/scan/page', async (req, reply) => {
  const page = parseInt(req.body?.page ?? req.query?.page ?? '1', 10);
  if (!page || page < 1) return reply.code(400).send({ error: 'page must be a positive integer' });
  reply.code(202).send({ status: 'accepted', page });
  withPollTracking(() => poll(page), log)().catch(() => {});
});

app.post('/scan/listing', async (req, reply) => {
  const { url } = req.body ?? {};
  if (!url || !url.includes('/inzerat/')) {
    return reply.code(400).send({ error: 'url must be a bazos /inzerat/ URL' });
  }
  reply.code(202).send({ status: 'accepted', url });
  processListing(url).catch(err => log.error('recheck failed', { url, err: err.message }));
});

// ─── Start ───────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: HTTP_PORT, host: '0.0.0.0' });
  log.info(`listening on :${HTTP_PORT} (${platform})`);

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
