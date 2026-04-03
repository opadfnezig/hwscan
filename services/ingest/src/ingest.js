import { pool } from './db.js';
import { uploadImages } from './s3.js';

export async function ingestRow(eventType, row) {
  if (eventType === 'listing.deleted' || eventType === 'listing.sold') {
    return markDeleted(row);
  }

  if (eventType === 'listing.ended') {
    return markEnded(row);
  }

  // Upload images to S3 before storing in PG
  if (row.image_paths?.length) {
    row.image_paths = await uploadImages(row.image_paths, row.platform, row.listing_id);
  }

  return upsertListing(row);
}

async function upsertListing(row) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch existing row for change comparison
    const existing = await client.query(
      `SELECT id, price, currency, title, description, location, seller_name, condition
       FROM listings WHERE platform = $1 AND listing_id = $2`,
      [row.platform, row.listing_id]
    );
    const old = existing.rows[0] ?? null;

    const { rows } = await client.query(`
      INSERT INTO listings (
        platform, listing_id, url, title, description,
        price, currency, negotiable, location, seller_name,
        condition, posted_at, scraped_at, first_seen_at, last_seen_at,
        image_paths, is_deleted, deleted_at, extras
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, NOW(), NOW(),
        $14, FALSE, NULL, $15
      )
      ON CONFLICT (platform, listing_id) DO UPDATE SET
        url         = EXCLUDED.url,
        title       = EXCLUDED.title,
        description = EXCLUDED.description,
        price       = EXCLUDED.price,
        currency    = EXCLUDED.currency,
        negotiable  = EXCLUDED.negotiable,
        location    = EXCLUDED.location,
        seller_name = EXCLUDED.seller_name,
        condition   = EXCLUDED.condition,
        posted_at   = COALESCE(EXCLUDED.posted_at, listings.posted_at),
        scraped_at  = EXCLUDED.scraped_at,
        last_seen_at = NOW(),
        image_paths = EXCLUDED.image_paths,
        is_deleted  = FALSE,
        deleted_at  = NULL,
        ended_at    = NULL,
        extras      = listings.extras || EXCLUDED.extras
      RETURNING id
    `, [
      row.platform, row.listing_id, row.url, row.title, row.description,
      row.price, row.currency, row.negotiable, row.location, row.seller_name,
      row.condition, row.posted_at, row.scraped_at,
      row.image_paths, JSON.stringify(row.extras),
    ]);

    const listingId = rows[0].id;

    // Track field-level changes
    if (old) {
      await trackChanges(client, old.id, row.platform, row.listing_id, old, row);
    }

    // Track price changes (dedicated table for easy price queries)
    if (old && row.price !== null && old.price !== null) {
      const oldAmt = parseFloat(old.price);
      if (Math.abs(oldAmt - row.price) > 0.01) {
        await client.query(
          `INSERT INTO price_history (listing_fk, platform, listing_id, old_price, new_price, currency)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [old.id, row.platform, row.listing_id, old.price, row.price, row.currency]
        );
      }
    }

    // Upsert bid history if present (aukro auctions)
    if (row.bid_history?.length) {
      await upsertBidHistory(client, listingId, row.platform, row.listing_id, row.bid_history);
    }

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function markDeleted(row) {
  await pool.query(`
    UPDATE listings
    SET is_deleted = TRUE, deleted_at = $3, ended_at = COALESCE(ended_at, $3), last_seen_at = NOW(),
        extras = extras || COALESCE($4::jsonb, '{}'::jsonb)
    WHERE platform = $1 AND listing_id = $2 AND is_deleted = FALSE
  `, [row.platform, row.listing_id, row.scraped_at, JSON.stringify(row.extras ?? {})]);
}

async function markEnded(row) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Use ending_at as exact ended_at if available, otherwise scraped_at
    const endedAt = row.ending_at ? new Date(row.ending_at) : new Date(row.scraped_at);

    // Upsert final state so we have the complete listing data
    const { rows } = await client.query(`
      INSERT INTO listings (
        platform, listing_id, url, title, description,
        price, currency, negotiable, location, seller_name,
        condition, posted_at, scraped_at, first_seen_at, last_seen_at,
        image_paths, is_deleted, deleted_at, ended_at, extras
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, NOW(), NOW(),
        $14, TRUE, $16, $16, $15
      )
      ON CONFLICT (platform, listing_id) DO UPDATE SET
        url         = EXCLUDED.url,
        title       = COALESCE(EXCLUDED.title, listings.title),
        description = COALESCE(EXCLUDED.description, listings.description),
        price       = COALESCE(EXCLUDED.price, listings.price),
        currency    = COALESCE(EXCLUDED.currency, listings.currency),
        location    = COALESCE(EXCLUDED.location, listings.location),
        seller_name = COALESCE(EXCLUDED.seller_name, listings.seller_name),
        condition   = COALESCE(EXCLUDED.condition, listings.condition),
        scraped_at  = EXCLUDED.scraped_at,
        last_seen_at = NOW(),
        is_deleted  = TRUE,
        deleted_at  = EXCLUDED.deleted_at,
        ended_at    = EXCLUDED.ended_at,
        extras      = listings.extras || EXCLUDED.extras
      RETURNING id
    `, [
      row.platform, row.listing_id, row.url, row.title, row.description,
      row.price, row.currency, row.negotiable, row.location, row.seller_name,
      row.condition, row.posted_at, row.scraped_at,
      row.image_paths ?? [], JSON.stringify(row.extras), endedAt,
    ]);

    // Upsert bid history if present
    if (row.bid_history?.length) {
      await upsertBidHistory(client, rows[0].id, row.platform, row.listing_id, row.bid_history);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const TRACKED_FIELDS = ['title', 'description', 'price', 'location', 'seller_name', 'condition'];

async function trackChanges(client, listingFk, platform, listingId, old, row) {
  for (const field of TRACKED_FIELDS) {
    const oldVal = old[field] != null ? String(old[field]) : null;
    const newVal = row[field] != null ? String(row[field]) : null;
    if (oldVal !== newVal) {
      await client.query(
        `INSERT INTO listing_changes (listing_fk, platform, listing_id, field, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [listingFk, platform, listingId, field, oldVal, newVal]
      );
    }
  }
}

async function upsertBidHistory(client, listingFk, platform, listingId, bids) {
  for (const bid of bids) {
    await client.query(
      `INSERT INTO auction_bids (listing_fk, platform, listing_id, amount, currency, bidder_name, bidder_rating, bidder_star, bid_time, proxy_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (platform, listing_id, amount, bid_time) DO NOTHING`,
      [listingFk, platform, listingId, bid.amount, bid.currency, bid.bidder_name, bid.bidder_rating, bid.bidder_star, bid.bid_time, bid.proxy_time]
    );
  }
}
