import Fastify from 'fastify';
import { createHash } from 'crypto';
import { SCAN_INTERVAL_MS, DOMAIN, CATEGORY_ID, SEEN_ID_LIMIT } from './config.js';
import { fetchCategoryPage, fetchListing } from './client.js';
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

async function processListing(listingId, url) {
  log.info(`processing ${listingId}`, { url });

  const result = await fetchListing(listingId);

  if (result.deleted) {
    log.info('deleted', { listing_id: listingId });
    await emit('listing.deleted', { listing_id: listingId, url });
    await deleteSnapshot(listingId);
    return;
  }

  const { data } = result;
  const { image_urls } = data;

  const snapshot = await getSnapshot(listingId);

  const newImageHash = sha1(image_urls);
  const newDataHash  = sha1({
    title:       data.title,
    price:       data.price,
    description: data.description,
    location_city: data.location_city,
    params:      data.params,
    delivery:    data.delivery,
    seller:      { id: data.seller.id, name: data.seller.name },
  });

  const imagesChanged = !snapshot || snapshot.image_hash !== newImageHash;
  const dataChanged   = !snapshot || snapshot.data_hash  !== newDataHash;

  let image_paths = snapshot?.image_paths || [];
  if (imagesChanged && image_urls.length > 0) {
    image_paths = await downloadImages(listingId, image_urls);
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
    if (snapshot.title       !== data.title)         changed_fields.push('title');
    if (snapshot.price       !== data.price)         changed_fields.push('price');
    if (snapshot.description !== data.description)   changed_fields.push('description');
    if (snapshot.location_city !== data.location_city) changed_fields.push('location');
    if (sha1(snapshot.params ?? []) !== sha1(data.params)) changed_fields.push('params');
    if (sha1(snapshot.delivery ?? {}) !== sha1(data.delivery)) changed_fields.push('delivery');
    if (imagesChanged) changed_fields.push('images');
    await emit('listing.changed', { ...payload, changed_fields });
    log.info('changed', { listing_id: listingId, fields: changed_fields });
  }

  await saveSnapshot(listingId, {
    title:         data.title,
    price:         data.price,
    description:   data.description,
    location_city: data.location_city,
    params:        data.params,
    delivery:      data.delivery,
    image_hash:    newImageHash,
    data_hash:     newDataHash,
    image_paths,
    last_seen:     new Date().toISOString(),
  });
}

// ─── Poll category page ──────────────────────────────────────────────────

async function poll() {
  const { listings } = await fetchCategoryPage(0, 50);
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

  log.info(`poll ${DOMAIN} cat=${CATEGORY_ID}: ${listings.length} fetched, ${processed} new`);
}

const trackedPoll = withPollTracking(poll, log);

// ─── HTTP API ────────────────────────────────────────────────────────────

app.get('/health', async (req, reply) => {
  const degraded = healthState.consecutiveFails >= 3 || healthState.pollErrors >= 3;
  return reply.code(degraded ? 503 : 200).send({
    status: degraded ? 'degraded' : 'ok',
    platform: DOMAIN,
    category_id: CATEGORY_ID,
    seen_ids: seenIds.size,
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
  if (!listing_id) return reply.code(400).send({ error: 'listing_id required' });
  reply.code(202).send({ status: 'accepted', listing_id });
  processListing(listing_id, url).catch(err =>
    log.error('recheck failed', { listing_id, err: err.message }),
  );
});

// ─── Start ───────────────────────────────────────────────────────────────

export async function startController() {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  log.info(`listening on :3000 (${DOMAIN} category=${CATEGORY_ID})`);
  log.info(`polling every ${SCAN_INTERVAL_MS / 1000}s`);

  trackedPoll().catch(() => {});
  setInterval(() => trackedPoll().catch(() => {}), SCAN_INTERVAL_MS);
}
