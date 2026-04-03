import fetch from 'node-fetch';
import { createWriteStream, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { getAgent, UA } from './proxy.js';
import { IMAGES_DIR } from './config.js';

mkdirSync(IMAGES_DIR, { recursive: true });

// Guess extension from URL path (default jpg)
function ext(url) {
  const e = extname(new URL(url).pathname);
  return e || '.jpg';
}

export async function downloadImages(listingId, imageUrls) {
  const paths = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = `ka_de_${listingId}_${i}${ext(url)}`;
    const filepath = join(IMAGES_DIR, filename);
    try {
      const res = await fetch(url, { agent: getAgent(), timeout: 60000, headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(res.body, createWriteStream(filepath));
      paths.push(filepath);
    } catch (err) {
      console.error(`[downloader] failed ${url}: ${err.message}`);
    }
  }
  return paths;
}
