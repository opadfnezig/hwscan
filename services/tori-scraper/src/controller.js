import Fastify from 'fastify';
import { createHash } from 'crypto';
import { SCAN_INTERVAL_MS, CATEGORY_PARAM, SEEN_ID_LIMIT } from './config.js';
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

// ─── Process a single listing (fetch, diff, emit) ───────────────────────

async function processListing(listingId, url) {
  log.info(`processing ${listingId}`, { url });

  const result = await scrapeListing(listingId, url);

  if (result.deleted) {
    const reason = result.reason || 'removed';
    const event = reason === 'sold' ? 'listing.sold' : 'listing.deleted';
    log.info(reason, { listing_id: listingId });
    await emit(event, { listing_id: listingId, url, deleted_reason: reason });
    await deleteSnapshot(listingId);
    return;
  }

  const { data } = result;
  const snapshot = await getSnapshot(listingId);

  const newImageHash = sha1(data.image_urls);
  const newDataHash  = sha1({
    title:       data.title,
    price:       data.price,
    description: data.description,
    location:    data.location,
    condition:   data.condition,
  });

  const imagesChanged = !snapshot || snapshot.image_hash !== newImageHash;
  const dataChanged   = !snapshot || snapshot.data_hash  !== newDataHash;

  let image_paths = snapshot?.image_paths || [];
  if (imagesChanged && data.image_urls.length > 0) {
    image_paths = await downloadImages(listingId, data.image_urls);
  }

  const payload = {
    ...data,
    image_paths,
    images_changed: imagesChanged,
  };

  if (!snapshot) {
    await emit('listing.new', payload);
    log.info('new listing', { listing_id: listingId, title: data.title });
  } else if (dataChanged || imagesChanged) {
    const changed_fields = [];
    if (snapshot.title       !== data.title)       changed_fields.push('title');
    if (snapshot.price       !== data.price)       changed_fields.push('price');
    if (snapshot.description !== data.description) changed_fields.push('description');
    if (snapshot.location    !== data.location)    changed_fields.push('location');
    if (imagesChanged) changed_fields.push('images');
    await emit('listing.changed', { ...payload, changed_fields });
    log.info('changed', { listing_id: listingId, fields: changed_fields });
  }

  await saveSnapshot(listingId, {
    title:       data.title,
    price:       data.price,
    description: data.description,
    location:    data.location,
    condition:   data.condition,
    image_hash:  newImageHash,
    data_hash:   newDataHash,
    image_paths,
    last_seen:   new Date().toISOString(),
  });
}

// ─── Poll category page ─────────────────────────────────────────────────

async function poll(pageNum = 1) {
  const { listings } = await scrapeCategoryPage(pageNum);
  let processed = 0;
  let seenRun = 0;

  for (const { id, url } of listings) {
    if (isSeen(id)) {
      seenRun++;
      if (seenRun >= 10) break;
      continue;
    }
    seenRun = 0;
    markSeen(id);

    try {
      await processListing(id, url);
      processed++;
    } catch (err) {
      log.error('process failed', { listing_id: id, err: err.message });
    }
  }

  log.info(`page ${pageNum}: ${listings.length} fetched, ${processed} new`);
}

const trackedPoll = withPollTracking(() => poll(1), log);

// ─── HTTP API ───────────────────────────────────────────────────────────

app.get('/health', async () => {
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return {
    status: degraded ? 'degraded' : 'ok',
    platform: 'tori.fi',
    category: CATEGORY_PARAM,
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
  reply.code(202).send({ status: 'accepted', page });
  withPollTracking(() => poll(page), log)().catch(() => {});
});

app.post('/scan/listing', async (req, reply) => {
  const { listing_id, url } = req.body ?? {};
  if (!listing_id || !url) return reply.code(400).send({ error: 'listing_id and url required' });
  reply.code(202).send({ status: 'accepted', listing_id });
  processListing(listing_id, url).catch(err => log.error('recheck failed', { listing_id, err: err.message }));
});

// ─── Start ──────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info('listening on :3000 (tori.fi)');

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
