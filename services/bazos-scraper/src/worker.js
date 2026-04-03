import { Worker } from 'bullmq';
import { createHash } from 'crypto';
import { makeBullConnection, getSnapshot, saveSnapshot, deleteSnapshot } from './redis.js';
import { scrapeListing } from './scraper.js';
import { downloadImages } from './downloader.js';
import { emit } from './kafka.js';
import { QUEUE_DISCOVER, QUEUE_RECHECK, WORKER_CONCURRENCY, PROXY_INDEX } from './config.js';
import { createLogger, attachWorkerEvents } from './observe.js';

const log = createLogger(`worker:${PROXY_INDEX}`);

function sha1(obj) {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

function changedFields(snapshot, data) {
  const fields = [];
  if (data.title      !== snapshot.title)      fields.push('title');
  if (data.price_raw  !== snapshot.price_raw)  fields.push('price');
  if (data.description !== snapshot.description) fields.push('description');
  if (data.location   !== snapshot.location)   fields.push('location');
  return fields;
}

async function processJob(job) {
  const { url, type } = job.data;

  log.info(`processing ${url}`, { type });

  const result = await scrapeListing(url);
  const listingId = url.match(/\/inzerat\/(\d+)\//)?.[1];

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
    return { status: 'deleted' };
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
  if (imagesChanged) {
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

  return { status: dataChanged || !snapshot ? 'emitted' : 'unchanged' };
}

export function startWorker() {
  const opts = {
    connection: makeBullConnection(),
    concurrency: WORKER_CONCURRENCY,
  };

  const workers = [
    new Worker(QUEUE_DISCOVER, processJob, opts),
    new Worker(QUEUE_RECHECK,  processJob, opts),
  ];

  for (const w of workers) {
    attachWorkerEvents(w, log);
  }

  log.info('ready', { concurrency: WORKER_CONCURRENCY });

  // Graceful shutdown
  const shutdown = async () => {
    log.info('shutting down');
    await Promise.all(workers.map(w => w.close()));
    const { disconnectKafka } = await import('./kafka.js');
    await disconnectKafka();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}
