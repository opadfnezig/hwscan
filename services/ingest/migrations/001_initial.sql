-- 001_initial.sql — listings + price_history

CREATE TABLE IF NOT EXISTS listings (
  id             BIGSERIAL PRIMARY KEY,
  platform       TEXT        NOT NULL,
  listing_id     TEXT        NOT NULL,
  url            TEXT,
  title          TEXT,
  description    TEXT,
  price          NUMERIC(12,2),
  currency       CHAR(3),
  negotiable     BOOLEAN     DEFAULT FALSE,
  location       TEXT,
  seller_name    TEXT,
  condition      TEXT,
  posted_at      TIMESTAMPTZ,
  scraped_at     TIMESTAMPTZ NOT NULL,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted     BOOLEAN     DEFAULT FALSE,
  deleted_at     TIMESTAMPTZ,
  image_paths    TEXT[]      DEFAULT '{}',
  extras         JSONB       DEFAULT '{}',

  CONSTRAINT listings_platform_id UNIQUE (platform, listing_id)
);

CREATE INDEX IF NOT EXISTS listings_platform_idx   ON listings (platform);
CREATE INDEX IF NOT EXISTS listings_price_idx      ON listings (price) WHERE price IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_scraped_idx    ON listings (scraped_at DESC);
CREATE INDEX IF NOT EXISTS listings_active_idx     ON listings (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS listings_extras_gin     ON listings USING gin (extras);

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  listing_fk  BIGINT      NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  platform    TEXT        NOT NULL,
  listing_id  TEXT        NOT NULL,
  old_price   NUMERIC(12,2),
  new_price   NUMERIC(12,2),
  currency    CHAR(3),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_history_listing_idx ON price_history (platform, listing_id);
CREATE INDEX IF NOT EXISTS price_history_changed_idx ON price_history (changed_at DESC);
