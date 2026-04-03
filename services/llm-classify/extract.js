import pg from 'pg';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// --- config ---
const RUNPOD_URL = process.env.RUNPOD_URL || 'https://api.runpod.ai/v2/YOUR_ENDPOINT';
const RUNPOD_KEY = process.env.RUNPOD_KEY || '';
const LLM_MODEL  = process.env.LLM_MODEL  || 'qwen3.5:27b';
const PG_HOST    = process.env.PG_HOST    || 'localhost';
const BATCH      = parseInt(process.env.BATCH_PER_PLATFORM || '100', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10); // 3 workers on runpod
const POLL_MS    = 2000;
const OUT_DIR    = process.env.OUT_DIR || './results';

const SYSTEM_PROMPT = await readFile(new URL('./prompt.md', import.meta.url), 'utf8');

const pool = new pg.Pool({
  host: PG_HOST, port: 5432,
  user: process.env.PG_USER || 'hw5c4n', password: process.env.PG_PASSWORD || '',
  database: 'hw5c4n', ssl: false,
});

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${RUNPOD_KEY}`,
};

// --- fetch listings ---
async function fetchListings() {
  const { rows } = await pool.query(`
    SELECT listing_id, platform, title, description, price, currency
    FROM (
      SELECT *, row_number() OVER (PARTITION BY platform ORDER BY random()) AS rn
      FROM listings
      WHERE NOT is_deleted AND price > 0
    ) sub
    WHERE rn <= $1
    ORDER BY platform, rn
  `, [BATCH]);
  return rows;
}

// --- call RunPod LLM ---
async function classify(listing) {
  const userMsg = [
    `Platform: ${listing.platform}`,
    `Title: ${listing.title}`,
    listing.description ? `Description: ${listing.description.slice(0, 1500)}` : '',
    `Price: ${listing.price} ${listing.currency}`,
  ].filter(Boolean).join('\n');

  const body = {
    input: {
      openai_route: '/v1/chat/completions',
      openai_input: {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.1,
        max_tokens: 512,
        stream: false,
      },
    },
  };

  // submit job
  const submitRes = await fetch(`${RUNPOD_URL}/run`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`submit ${submitRes.status}: ${text.slice(0, 200)}`);
  }

  const { id: jobId } = await submitRes.json();

  // poll for result
  for (let i = 0; i < 120; i++) { // max 4 min
    await new Promise(r => setTimeout(r, POLL_MS));

    const statusRes = await fetch(`${RUNPOD_URL}/status/${jobId}`, { headers });
    const status = await statusRes.json();

    if (status.status === 'COMPLETED') {
      const data = status.output;
      const raw = data?.choices?.[0]?.message?.content || '';
      try {
        return { ok: true, result: JSON.parse(raw), tokens: data?.usage };
      } catch {
        return { ok: false, result: null, raw, tokens: data?.usage };
      }
    }

    if (status.status === 'FAILED') {
      throw new Error(`job failed: ${JSON.stringify(status.error || status).slice(0, 200)}`);
    }
  }

  throw new Error(`job ${jobId} timed out`);
}

// --- concurrent runner ---
async function runPool(items, fn, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  let done = 0;
  const t0 = Date.now();

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        results[i] = { ok: false, error: err.message };
      }
      done++;
      if (done % 10 === 0) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        const rate = (done / (Date.now() - t0) * 1000).toFixed(1);
        console.log(`progress: ${done}/${items.length} (${elapsed}s, ${rate}/s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// --- main ---
async function main() {
  // check workers are ready
  console.log('checking RunPod endpoint health...');
  const healthRes = await fetch(`${RUNPOD_URL}/health`, { headers });
  const health = await healthRes.json();
  const ready = health.workers?.ready || 0;
  const init = health.workers?.initializing || 0;
  console.log(`workers: ${ready} ready, ${init} initializing`);
  if (ready === 0 && init === 0) {
    console.error('no workers available, exiting');
    process.exit(1);
  }
  if (ready === 0) {
    console.log('workers still initializing, waiting 30s...');
    await new Promise(r => setTimeout(r, 30_000));
  }

  console.log(`fetching ${BATCH} listings per platform...`);
  const listings = await fetchListings();
  console.log(`got ${listings.length} listings`);

  console.log(`classifying with concurrency=${CONCURRENCY}...`);
  const t0 = Date.now();
  const results = await runPool(listings, classify, CONCURRENCY);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // merge
  const output = listings.map((l, i) => ({
    listing_id: l.listing_id,
    platform: l.platform,
    title: l.title,
    price: l.price,
    currency: l.currency,
    ...results[i],
  }));

  // stats
  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  const totalTokens = results.reduce((s, r) => s + (r.tokens?.total_tokens || 0), 0);
  const categories = {};
  for (const r of results) {
    if (r.ok && r.result?.category) {
      categories[r.result.category] = (categories[r.result.category] || 0) + 1;
    }
  }

  console.log(`\ndone in ${elapsed}s`);
  console.log(`ok: ${ok}, failed: ${fail}`);
  console.log(`total tokens: ${totalTokens}`);
  console.log(`category distribution:`, categories);

  // save
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().slice(0, 10);
  const outPath = `${OUT_DIR}/${ts}-classify.json`;
  await writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`saved to ${outPath}`);

  // save summary
  const summary = { ts, elapsed, ok, fail, totalTokens, categories, listingsPerPlatform: BATCH };
  await writeFile(`${OUT_DIR}/${ts}-summary.json`, JSON.stringify(summary, null, 2));

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
