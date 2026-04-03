import fetch from 'node-fetch';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getAgent } from './proxy.js';
import { IMAGES_DIR, DOMAIN_SUFFIX } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

mkdirSync(IMAGES_DIR, { recursive: true });

function imagePath(listingId, index) {
  return join(IMAGES_DIR, `bazos_${DOMAIN_SUFFIX}_${listingId}_${index}.jpg`);
}

// Download all images for a listing.
// Returns array of absolute local paths for successfully downloaded images.
export async function downloadImages(listingId, imageUrls) {
  const paths = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filepath = imagePath(listingId, i);

    try {
      const response = await fetch(url, {
        agent: getAgent(),
        timeout: 60000,
        headers: { 'User-Agent': UA },
      });

      if (!response.ok) {
        console.warn(`[downloader] ${listingId}[${i}]: HTTP ${response.status} for ${url}`);
        continue;
      }

      await pipeline(response.body, createWriteStream(filepath));
      paths.push(filepath);
    } catch (err) {
      console.warn(`[downloader] ${listingId}[${i}]: ${err.message}`);
    }
  }

  return paths;
}
