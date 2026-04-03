import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { scrapeBinary } from './anthill.js';
import { IMAGES_DIR } from './config.js';

mkdirSync(IMAGES_DIR, { recursive: true });

export async function downloadImages(listingId, imageUrls) {
  const paths = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = `aukro_cz_${listingId}_${i}.jpg`;
    const filepath = join(IMAGES_DIR, filename);
    try {
      const buf = await scrapeBinary(url, { proxy: true, timeout: 60000 });
      writeFileSync(filepath, buf);
      paths.push(filepath);
    } catch (err) {
      console.error(`[downloader] failed ${url}: ${err.message}`);
    }
  }
  return paths;
}
