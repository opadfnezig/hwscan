import { readFile, access, unlink } from 'fs/promises';
import { extname } from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION } from './config.js';

let client = null;

function getClient() {
  if (!client) {
    client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: true,
    });
  }
  return client;
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Upload images from local paths to Garage S3.
 * Returns array of S3 keys for successfully uploaded images.
 * No-op if S3_ENDPOINT is not configured.
 */
export async function uploadImages(localPaths, platform, listingId) {
  if (!S3_ENDPOINT || !localPaths?.length) return localPaths ?? [];

  const s3 = getClient();
  const keys = [];

  for (let i = 0; i < localPaths.length; i++) {
    const localPath = localPaths[i];
    try {
      await access(localPath);
    } catch {
      continue; // file missing, skip
    }

    const ext = extname(localPath) || '.jpg';
    const key = `${platform}/${listingId}/${i}${ext}`;

    try {
      const body = await readFile(localPath);
      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: MIME[ext.toLowerCase()] || 'application/octet-stream',
      }));
      keys.push(key);
      await unlink(localPath).catch(() => {});
    } catch (err) {
      console.error(`[s3] upload failed ${key}: ${err.message}`);
    }
  }

  return keys;
}
