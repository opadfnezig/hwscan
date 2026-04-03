import Fastify from 'fastify';
import { createHash } from 'crypto';
import { SCAN_INTERVAL_MS, CATEGORY_SEO_URL, SEEN_ID_LIMIT } from './config.js';
import { fetchCategoryPage, fetchListing, fetchBidHistory } from './client.js';
import { downloadImages } from './downloader.js';
import { getSnapshot, saveSnapshot, deleteSnapshot } from './redis.js';
import { emit } from './kafka.js';
import { createLogger, healthState, withPollTracking } from './observe.js';

const log = createLogger('controller');
const app = Fastify({ logger: false });

function sha1(obj) {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

// ─── In-memory seen set (no Redis needed) ────────────────────────────────

const seenIds = new Set();

function isSeen(id) {
  return seenIds.has(String(id));
}

function markSeen(id) {
  seenIds.add(String(id));
  // Cap size
  if (seenIds.size > SEEN_ID_LIMIT) {
    const first = seenIds.values().next().value;
    seenIds.delete(first);
  }
}

// ─── Process a single listing (fetch, diff, emit) ────────────────────────

async function processListing(listingId) {
  log.info(`processing ${listingId}`);

  const result = await fetchListing(listingId);

  if (result.deleted) {
    log.info('deleted', { listing_id: listingId });
    await emit('listing.deleted', { listing_id: listingId });
    await deleteSnapshot(listingId);
    return;
  }

  const { data } = result;

  if (data.item_type === 'BIDDING') {
    data.bid_history = await fetchBidHistory(listingId);
  }

  if (result.ended) {
    log.info('ended', { listing_id: listingId, item_type: data.item_type });
    await emit('listing.ended', data);
    await deleteSnapshot(listingId);
    return;
  }

  const snapshot = await getSnapshot(listingId);

  const newImageHash = sha1(data.image_urls);
  const newDataHash  = sha1({
    title:       data.title,
    price:       data.price,
    description: data.description,
    location:    data.location,
    params:      data.params,
  });

  const imagesChanged = !snapshot || snapshot.image_hash !== newImageHash;
  const dataChanged   = !snapshot || snapshot.data_hash  !== newDataHash;

  let image_paths = snapshot?.image_paths || [];
  if (imagesChanged && data.image_urls.length > 0) {
    image_paths = await downloadImages(listingId, data.image_urls);
  }

  const payload = { ...data, image_paths, images_changed: imagesChanged };

  if (!snapshot) {
    await emit('listing.new', payload);
    log.info('new listing', { listing_id: listingId, title: data.title });
  } else if (dataChanged || imagesChanged) {
    const changed_fields = [];
    if (snapshot.title       !== data.title)       changed_fields.push('title');
    if (snapshot.price       !== data.price)       changed_fields.push('price');
    if (snapshot.description !== data.description) changed_fields.push('description');
    if (imagesChanged) changed_fields.push('images');
    await emit('listing.changed', { ...payload, changed_fields });
    log.info('changed', { listing_id: listingId, fields: changed_fields });
  }

  await saveSnapshot(listingId, {
    title:       data.title,
    price:       data.price,
    description: data.description,
    location:    data.location,
    params:      data.params,
    image_hash:  newImageHash,
    data_hash:   newDataHash,
    image_paths,
    last_seen:   new Date().toISOString(),
  });
}

// ─── Poll category page ──────────────────────────────────────────────────

async function poll(pageNum = 0) {
  const { listings, totalElements } = await fetchCategoryPage(pageNum, 60);
  let processed = 0;
  let seenRun = 0;

  for (const { id } of listings) {
    if (isSeen(id)) {
      seenRun++;
      if (seenRun >= 10) break;
      continue;
    }
    seenRun = 0;
    markSeen(id);

    try {
      await processListing(id);
      processed++;
    } catch (err) {
      log.error('process failed', { listing_id: id, err: err.message });
    }
  }

  log.info(`page ${pageNum}: ${listings.length} fetched (${totalElements} total), ${processed} new`);
}

const trackedPoll = withPollTracking(() => poll(0), log);

// ─── HTTP API (health + recheck trigger from ingest) ─────────────────────

app.get('/health', async () => {
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return {
    status: degraded ? 'degraded' : 'ok',
    platform: 'aukro.cz',
    category: CATEGORY_SEO_URL,
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
  const page = parseInt(req.body?.page ?? req.query?.page ?? '0', 10);
  reply.code(202).send({ status: 'accepted', page });
  withPollTracking(() => poll(page), log)().catch(() => {});
});

app.post('/scan/listing', async (req, reply) => {
  const { listing_id, url } = req.body ?? {};
  const id = listing_id || (url && url.match(/-(\d+)$/)?.[1]);
  if (!id) return reply.code(400).send({ error: 'listing_id or url required' });
  reply.code(202).send({ status: 'accepted', listing_id: id });
  processListing(id).catch(err => log.error('recheck failed', { listing_id: id, err: err.message }));
});

// ─── Start ───────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info('listening on :3000 (aukro.cz)');

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
