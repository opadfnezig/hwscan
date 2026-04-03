import fetch from 'node-fetch';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getAgent, UA } from './proxy.js';
import { IMAGES_DIR } from './config.js';

mkdirSync(IMAGES_DIR, { recursive: true });

export async function downloadImages(listingId, imageUrls) {
  const paths = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = `aukro_cz_${listingId}_${i}.jpg`;
    const filepath = join(IMAGES_DIR, filename);
    try {
      const res = await fetch(url, {
        agent: getAgent(),
        timeout: 60000,
        headers: { 'User-Agent': UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(res.body, createWriteStream(filepath));
      paths.push(filepath);
    } catch (err) {
      console.error(`[downloader] failed ${url}: ${err.message}`);
    }
  }
  return paths;
}
