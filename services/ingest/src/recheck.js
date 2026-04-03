import { pool } from './db.js';
import { RECHECK_INTERVAL_H, SCRAPER_HOST } from './config.js';

const log = (level, msg, extra) =>
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, component: 'recheck', msg, ...extra }) + '\n');

const PER_MINUTE = 10;         // dispatches per platform per tick
const TICK_MS    = 60 * 1000;  // 1 minute
const STARTUP_DELAY = 5 * 60 * 1000;

// Platform → scraper endpoint config
const SCRAPERS = {
  'bazos.cz':          { port: 3000, body: (r) => ({ url: r.url }) },
  'bazos.sk':          { port: 3004, body: (r) => ({ url: r.url }) },
  'kleinanzeigen.de':  { port: 3001, body: (r) => ({ url: r.url }) },
  'olx.ua':            { port: 3002, body: (r) => ({ listing_id: r.listing_id, url: r.url }) },
  'olx.pl':            { port: 3003, body: (r) => ({ listing_id: r.listing_id, url: r.url }) },
  'tori.fi':           { port: 3005, body: (r) => ({ listing_id: r.listing_id, url: r.url }) },
  'aukro.cz':          { port: 3006, body: (r) => ({ listing_id: r.listing_id }) },
};

const PLATFORMS = Object.keys(SCRAPERS);

async function dispatchRecheck(row) {
  const scraper = SCRAPERS[row.platform];
  if (!scraper) return false;

  const endpoint = `http://${SCRAPER_HOST}:${scraper.port}/scan/listing`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scraper.body(row)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 202) {
      log('warn', 'dispatch rejected', { platform: row.platform, listing_id: row.listing_id, status: res.status, endpoint });
      return false;
    }
    return true;
  } catch (err) {
    log('warn', 'dispatch failed', { platform: row.platform, listing_id: row.listing_id, endpoint, err: err.message });
    return false;
  }
}

async function tick() {
  // Fetch per-platform stale counts
  const { rows: staleCounts } = await pool.query(`
    SELECT platform, count(*)::int AS stale
    FROM listings
    WHERE is_deleted = FALSE
      AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '${RECHECK_INTERVAL_H} hours')
    GROUP BY platform
    ORDER BY platform
  `);

  const staleMap = Object.fromEntries(staleCounts.map(r => [r.platform, r.stale]));
  const totalStale = staleCounts.reduce((s, r) => s + r.stale, 0);

  if (totalStale === 0) return;

  log('info', 'recheck tick', { total_stale: totalStale, by_platform: staleMap });

  let totalDispatched = 0;

  for (const platform of PLATFORMS) {
    if (!staleMap[platform]) continue;

    const { rows } = await pool.query(`
      SELECT id, platform, listing_id, url
      FROM listings
      WHERE platform = $1
        AND is_deleted = FALSE
        AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '${RECHECK_INTERVAL_H} hours')
      ORDER BY last_checked_at NULLS FIRST
      LIMIT $2
    `, [platform, PER_MINUTE]);

    let dispatched = 0;
    for (const row of rows) {
      const ok = await dispatchRecheck(row);
      if (ok) {
        await pool.query('UPDATE listings SET last_checked_at = NOW() WHERE id = $1', [row.id]);
        dispatched++;
      }
    }
    totalDispatched += dispatched;
  }

  log('info', 'tick complete', { dispatched: totalDispatched });
}

export function startRecheck() {
  log('info', 'scheduler started', { interval_h: RECHECK_INTERVAL_H, per_minute: PER_MINUTE });

  setTimeout(() => {
    tick().catch(err => log('error', 'tick error', { err: err.message }));
    setInterval(() => {
      tick().catch(err => log('error', 'tick error', { err: err.message }));
    }, TICK_MS);
  }, STARTUP_DELAY);
}
