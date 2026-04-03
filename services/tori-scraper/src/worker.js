import { Worker } from 'bullmq';
import { createHash } from 'crypto';
import { makeBullConnection, getSnapshot, saveSnapshot, deleteSnapshot } from './redis.js';
import { QUEUE_DISCOVER, QUEUE_RECHECK, WORKER_CONCURRENCY } from './config.js';
import { scrapeListing } from './scraper.js';
import { downloadImages } from './downloader.js';
import { emit } from './kafka.js';
import { createLogger, attachWorkerEvents } from './observe.js';

const log = createLogger(`worker:${process.env.PROXY_INDEX ?? 0}`);

function sha1(obj) {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

async function processJob(job) {
  const { listing_id, url } = job.data;
  log.info(`processing ${listing_id}`, { url });

  const result = await scrapeListing(listing_id, url);

  if (result.deleted) {
    const reason = result.reason || 'removed';
    const event = reason === 'sold' ? 'listing.sold' : 'listing.deleted';
    log.info(reason, { listing_id });
    await emit(event, { listing_id, url, deleted_reason: reason });
    await deleteSnapshot(listing_id);
    return;
  }

  const { data } = result;
  const snapshot = await getSnapshot(listing_id);

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
    image_paths = await downloadImages(listing_id, data.image_urls);
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
    if (snapshot.price       !== data.price)       changed_fields.push('price');
    if (snapshot.description !== data.description) changed_fields.push('description');
    if (snapshot.location    !== data.location)    changed_fields.push('location');
    if (imagesChanged) changed_fields.push('images');
    await emit('listing.changed', { ...payload, changed_fields });
    log.info('changed', { listing_id, fields: changed_fields });
  }

  await saveSnapshot(listing_id, {
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

export function startWorker() {
  const opts = {
    connection:  makeBullConnection(),
    concurrency: WORKER_CONCURRENCY,
  };

  const discoverWorker = new Worker(QUEUE_DISCOVER, processJob, opts);
  const recheckWorker  = new Worker(QUEUE_RECHECK,  processJob, { ...opts, connection: makeBullConnection() });

  for (const w of [discoverWorker, recheckWorker]) {
    attachWorkerEvents(w, log);
  }

  log.info('started', { concurrency: WORKER_CONCURRENCY });

  async function shutdown() {
    await Promise.all([discoverWorker.close(), recheckWorker.close()]);
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}
