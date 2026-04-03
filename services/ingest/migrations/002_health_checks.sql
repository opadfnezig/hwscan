-- 002_health_checks.sql — lifecycle tracking, change history, auction bids

ALTER TABLE listings ADD COLUMN ended_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN last_checked_at TIMESTAMPTZ;

-- Backfill ended_at from deleted_at for already-deleted listings
UPDATE listings SET ended_at = deleted_at WHERE is_deleted = TRUE;

-- Recheck scheduler: find active listings not checked recently
CREATE INDEX IF NOT EXISTS listings_recheck_idx
  ON listings (last_checked_at NULLS FIRST)
  WHERE is_deleted = FALSE;

-- Field-level change history
CREATE TABLE IF NOT EXISTS listing_changes (
  id          BIGSERIAL PRIMARY KEY,
  listing_fk  BIGINT      NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  platform    TEXT        NOT NULL,
  listing_id  TEXT        NOT NULL,
  field       TEXT        NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS listing_changes_listing_idx ON listing_changes (platform, listing_id);
CREATE INDEX IF NOT EXISTS listing_changes_time_idx    ON listing_changes (changed_at DESC);

-- Auction bid history (aukro)
CREATE TABLE IF NOT EXISTS auction_bids (
  id            BIGSERIAL PRIMARY KEY,
  listing_fk    BIGINT        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  platform      TEXT          NOT NULL,
  listing_id    TEXT          NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  currency      CHAR(3)       NOT NULL DEFAULT 'CZK',
  bidder_name   TEXT,
  bidder_rating INTEGER,
  bidder_star   TEXT,
  bid_time      TIMESTAMPTZ   NOT NULL,
  proxy_time    TIMESTAMPTZ,
  CONSTRAINT auction_bids_unique UNIQUE (platform, listing_id, amount, bid_time)
);
CREATE INDEX IF NOT EXISTS auction_bids_listing_idx ON auction_bids (platform, listing_id);
