/**
 * Anthill client — submit scrape jobs and poll for results.
 * Replaces direct node-fetch + socks-proxy-agent calls.
 */

import { ANTHILL_URL } from './config.js';

const POLL_INTERVAL = 300;
const MAX_WAIT = 60000;

/**
 * Submit a scrape job to anthill and wait for result.
 */
export async function scrape(url, opts = {}) {
  const submitRes = await fetch(`${ANTHILL_URL}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...opts }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`anthill submit failed: ${submitRes.status} ${err}`);
  }

  const { id } = await submitRes.json();

  const deadline = Date.now() + (opts.timeout || MAX_WAIT);
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const pollRes = await fetch(`${ANTHILL_URL}/result/${id}`);
    if (pollRes.status === 404) continue;

    const result = await pollRes.json();
    if (result.status === 'completed') return result.data;
    if (result.status === 'failed') throw new Error(result.error || 'anthill job failed');
  }

  throw new Error(`anthill timeout waiting for job ${id}`);
}

/**
 * Fetch HTML page via anthill. Returns { body, url, statusCode }.
 */
export async function scrapeHTML(url, opts = {}) {
  const data = await scrape(url, opts);
  if (data.statusCode >= 400) throw new Error(`HTTP ${data.statusCode} for ${url}`);
  return data;
}

/**
 * Download binary content via anthill. Returns Buffer.
 */
export async function scrapeBinary(url, opts = {}) {
  const data = await scrape(url, { ...opts, responseType: 'binary' });
  if (data.statusCode >= 400) throw new Error(`HTTP ${data.statusCode} for ${url}`);
  return Buffer.from(data.body, 'base64');
}
