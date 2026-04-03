# HW5C4N - Hardware Marketplace Aggregator

**Codename:** hw5c4n (pronounced "hw-scan")

Cross-platform hardware listings aggregator targeting used PC hardware across Central/Northern Europe. Scrapes 7 marketplaces, normalizes data into PostgreSQL, tracks price changes and listing lifecycle, stores images in S3.

---

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Architecture](#architecture)
4. [Platforms](#platforms)
5. [Data Pipeline](#data-pipeline)
6. [Data Model](#data-model)
7. [Infrastructure](#infrastructure)
8. [Observability](#observability)
9. [Stage 4: AI Classification](#stage-4-ai-classification)
10. [Future Scope](#future-scope)

---

## Overview

### Goal
Self-hosted tool to aggregate, structure, and analyze hardware listings from 7 European marketplaces. Currently focused on PC hardware (components, servers, peripherals, networking). Potential for commercial data product (pricing intelligence, cross-border arbitrage, market research).

### Platforms (7 total)
| Platform | Country | Currency | Method | Category |
|----------|---------|----------|--------|----------|
| bazos.cz | CZ | CZK | HTML scraping | PC hardware |
| bazos.sk | SK | EUR | HTML scraping | PC hardware |
| kleinanzeigen.de | DE | EUR | HTML scraping | PC-Zubehör + PCs |
| olx.ua | UA | UAH | REST API | Computers & Components |
| olx.pl | PL | PLN | REST API | Komputery |
| tori.fi | FI | EUR | HTML (React dehydrated state) | Tietotekniikka (IT) |
| aukro.cz | CZ | CZK | REST API | Počítače a hry |

### Key Capabilities (Implemented)
- Continuous scraping with 10-minute poll intervals
- Dedup via Redis seen-URL sets
- SHA1-based change detection (only emit events when data changes)
- Image download through SOCKS5 residential proxies
- S3 image storage (Garage)
- Kafka event bus (new/changed/deleted/sold/ended events)
- PostgreSQL with field-level change tracking
- Price history tracking
- Daily health rechecks of active listings
- Aukro auction bid history tracking
- Sold vs expired distinction (aukro via sold_quantity, tori.fi via "Myyty" badge)
- Structured JSON logging + Telegram alerts on failures

---

## Current State

**As of 2026-04-01:**

| Metric | Value |
|--------|-------|
| Total listings in DB | ~418,000 |
| Data collection period | 27 days (Mar 4 – Mar 31) |
| Active listings | ~285,000 |
| Deleted/sold/expired | ~133,000 |
| S3 storage | ~100 GB (images) |
| Growth rate | ~5-6 GB/day |
| Price changes tracked | ~15,000+ |
| Platforms operational | 6 of 7 (bazos.sk scraping but low volume) |

### Stage Completion

| Stage | Status | Notes |
|-------|--------|-------|
| Stage 0: Discovery | ✅ COMPLETE | 7 platforms identified, all accessible |
| Stage 1: PoC | ✅ COMPLETE | bazos.cz microservice |
| Stage 2: All platforms | ✅ COMPLETE | All 7 platform microservices built |
| Stage 3: Pipeline | ✅ COMPLETE | Observability, ingest, S3, health checks, change tracking |
| Stage 4: AI classification | 🔲 NEXT | LLM-based product extraction (Qwen3.5 27B) |

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Scraper Host (172.16.5.x)                                                  │
│                                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ bazos-cz │ │kleinanz. │ │ olx-ua   │ │ olx-pl   │ │ tori-fi  │          │
│  │ :3000    │ │ :3001    │ │ :3002    │ │ :3003    │ │ :3005    │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │             │            │             │            │                 │
│  ┌────┴─────┐ ┌────┴─────┐     │             │       ┌────┴─────┐          │
│  │ bazos-sk │ │          │     │             │       │ aukro-cz │          │
│  │ :3004    │ │          │     │             │       │ :3006    │          │
│  └────┬─────┘ └──────────┘     │             │       └────┬─────┘          │
│       │                         │             │            │                 │
│       └─────────────┬───────────┴─────────────┴────────────┘                │
│                     │                                                        │
│              ┌──────▼──────┐                                                │
│              │    Kafka    │──────────────────────────────┐                  │
│              │  (7 topics) │                              │                  │
│              └─────────────┘                              │                  │
│                                                    ┌─────▼──────┐           │
│  Each scraper has:                                 │   Ingest   │           │
│  - 1 Controller (Fastify, polls pages)             │  Service   │           │
│  - 10 Workers (1 proxy each, 2 concurrent)         └─────┬──────┘           │
│  - 1 Redis (seen URLs, snapshots, BullMQ)                │                  │
│                                                          │                  │
│  ┌─────────────────┐                                     │                  │
│  │ /data/images/   │◄────────────(download)──────────────┤                  │
│  │  (shared vol)   │─────────────(upload)────────────────┤                  │
│  └─────────────────┘                                     │                  │
│                                                          │                  │
├──────────────────────────────────────────────────────────┼──────────────────┤
│  Storage Host (172.16.17.3)                              │                  │
│                                                          │                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │                  │
│  │  PostgreSQL  │◄─┤    Kafka     │  │  Garage S3   │◄──┘                  │
│  │  (listings,  │  │  (single     │  │  (images)    │                      │
│  │   changes,   │  │   broker)    │  │  172.16.17.3 │                      │
│  │   bids)      │  │              │  │  :3900       │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Per-Scraper Architecture

Each platform scraper follows the same pattern:

```
Controller (1 container)
├── Fastify HTTP API (:300x)
├── GET /health — seen_url count, queue depths, health state
├── POST /scan/page — scan category page N
├── POST /scan/listing — force-enqueue URL for recheck
└── Polls page 1 every 10 minutes

Workers (10 containers, 1 proxy each, 2 concurrent jobs)
├── Pull from BullMQ discover queue (deduped by stable jobId)
├── Pull from BullMQ recheck queue (no dedup)
└── Pipeline: scrape → sha1 diff → download images → emit Kafka → save snapshot

Redis (1 container)
├── Seen-URL sorted set (capped at 1000)
├── Snapshots with 7-day TTL
└── BullMQ job queues
```

**Exceptions:**
- **OLX (ua/pl):** Uses REST API, no HTML scraping. Node 20 built-in fetch (undici) for TLS fingerprint. Direct connection (proxies get 403 on API).
- **Aukro:** REST API, no Puppeteer. Mobile UA or full browser headers to pass CF. Bid history API for auctions.
- **Tori.fi:** Parses dehydrated React Query state (base64-encoded JSON in `<script>` tags).

---

## Platforms

### bazos.cz / bazos.sk
- **Category page:** Flat flex layout, `a[href*="/inzerat/"]` links (appear twice, dedup by href)
- **Pagination:** Path-based `/{offset}/` — page 2 = `/20/`
- **Listing page:** `h1.nadpisdetail`, `.inzeratycena span[translate="no"]`, `.popisdetail`
- **Deletion:** Redirect away from `/inzerat/` path
- **Shared codebase:** bazos-sk builds from `../bazos-scraper`

### kleinanzeigen.de
- **Categories:** c225 (PC-Zubehör, 631k) + c228 (PCs, 57k)
- **Pagination:** `/seite:N/` inserted before `/cNNN` segment
- **Deletion:** `page_type: "eVIP"` in `window.BelenConf` inline script (server-side rendered, reliable)
- **Note:** `badge-unavailable` class (Reserviert/Gelöscht) is JS-rendered, NOT detectable via HTML scraping
- **Params:** `.addetailslist--detail` label:value pairs
- **Seller:** userId from `bestandsliste?userId=` param

### olx.ua / olx.pl
- **Method:** Public REST API — no HTML scraping needed
- **Category endpoint:** `GET /api/v1/offers/?category_id={id}&sort_by=created_at:desc&limit=50`
- **Listing endpoint:** `GET /api/v1/offers/{id}/` — 404/410 = deleted, status != 'active' = inactive
- **OLX.ua:** category_id=38 (Computers & Components, 220k)
- **OLX.pl:** category_id=443 (Komputery, 270k)
- **TLS:** CloudFront WAF blocks node-fetch; use Node 20 built-in fetch (undici)
- **Proxies:** Get 403 on category endpoint; use direct connection

### tori.fi
- **Category:** Tietotekniikka (IT), dehydrated React Query state
- **Listing page:** LD+JSON Product schema + HTML selectors
- **Sold detection:** "Myyty" badge in HTML → `listing.sold` event with `deleted_reason: 'sold'`
- **Expired detection:** No Product LD+JSON → `listing.deleted` with `deleted_reason: 'expired'`
- **404:** `listing.deleted` with `deleted_reason: 'removed'`
- **Missing data:** No seller name, no posted_at timestamp

### aukro.cz
- **Method:** REST API (GraphQL-like endpoints)
- **Types:** BIDDING (auctions) and BUYNOW (fixed price)
- **Events:** `listing.new`, `listing.changed`, `listing.deleted` (404), `listing.ended` (state=ENDED)
- **Sold distinction:** `extras.sold_quantity > 0` means sold; 0 means expired
- **Bid history:** `GET /backend-web/api/bids/{id}/bidHistory`
- **CF bypass:** Mobile UA or full browser header sets (not IP-dependent)

---

## Data Pipeline

### Event Flow

```
Scraper polls category page
    → New URLs discovered
    → Enqueued to BullMQ (deduped by URL hash)
    → Worker picks up job
    → Scrapes listing page
    → Computes SHA1 of data fields + image URLs
    → Compares with Redis snapshot
    → If new/changed:
        → Downloads images to shared volume
        → Emits Kafka event (listing.new / listing.changed)
    → If deleted/sold:
        → Emits listing.deleted / listing.sold / listing.ended
    → Saves snapshot to Redis (7-day TTL)

Kafka event consumed by Ingest Service
    → Normalizes to common schema (per-platform normalizer)
    → Uploads images to Garage S3
    → Deletes local image files after successful upload
    → Upserts to PostgreSQL
    → Tracks field-level changes (listing_changes table)
    → Tracks price history (price_history table)
    → Tracks bid history for aukro (auction_bids table)

Recheck Scheduler (in ingest service)
    → Queries stale active listings (not checked in RECHECK_INTERVAL_H hours)
    → POSTs to scraper /scan/listing endpoint
    → 100 per batch, runs hourly, 5min startup delay
```

### Kafka Topics
- `bazos.cz.listings`
- `bazos.sk.listings`
- `kleinanzeigen.listings`
- `olx.ua.listings`
- `olx.pl.listings`
- `tori.listings`
- `aukro.listings`

### Event Types
- `listing.new` — first time seen, full data + images
- `listing.changed` — data or images changed, includes `changed_fields`
- `listing.deleted` — HTTP 404, redirect, or platform-specific deletion signal
- `listing.sold` — explicitly sold (tori.fi "Myyty" badge)
- `listing.ended` — aukro auction ended (may or may not have sold)

---

## Data Model

### PostgreSQL Schema

```sql
-- Main listings table
listings (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  listing_id VARCHAR(100) NOT NULL,
  url TEXT,
  title TEXT,
  description TEXT,
  price DECIMAL(12,2),
  currency VARCHAR(3),
  negotiable BOOLEAN DEFAULT FALSE,
  location TEXT,
  seller_name TEXT,
  condition VARCHAR(50),
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  image_paths JSONB DEFAULT '[]',        -- S3 keys: {platform}/{listing_id}/{index}.jpg
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  extras JSONB DEFAULT '{}',             -- Platform-specific fields
  UNIQUE(platform, listing_id)
);

-- Field-level change history
listing_changes (
  id SERIAL PRIMARY KEY,
  listing_fk INTEGER REFERENCES listings(id),
  platform VARCHAR(20),
  listing_id VARCHAR(100),
  field VARCHAR(50),                     -- title, description, price, location, seller_name, condition
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price change history
price_history (
  id SERIAL PRIMARY KEY,
  listing_fk INTEGER REFERENCES listings(id),
  platform VARCHAR(20),
  listing_id VARCHAR(100),
  old_price DECIMAL(12,2),
  new_price DECIMAL(12,2),
  currency VARCHAR(3),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aukro auction bid timeline
auction_bids (
  id SERIAL PRIMARY KEY,
  listing_fk INTEGER REFERENCES listings(id),
  platform VARCHAR(20),
  listing_id VARCHAR(100),
  amount DECIMAL(12,2),
  currency VARCHAR(3),
  bidder_name TEXT,
  bidder_rating INTEGER,
  bidder_star VARCHAR(20),
  bid_time TIMESTAMPTZ,
  proxy_time TIMESTAMPTZ,
  UNIQUE(platform, listing_id, amount, bid_time)
);
```

### Platform-Specific Extras (JSONB)

**bazos.cz/sk:** `{ views, price_raw, last_known }`
**kleinanzeigen.de:** `{ params, shipping_available, shipping_raw, seller_id, seller_url, price_raw }`
**olx.ua/pl:** `{ params, seller, delivery, contact, promoted, price_label, arranged, refreshed_at }`
**tori.fi:** `{ category_path, deleted_reason }` — deleted_reason: 'sold' | 'expired' | 'removed'
**aukro.cz:** `{ item_type, auction_price, buy_now_price, bidders_count, best_offer, quantity, ending_at, sold_quantity, category_path, params, seller, shipping_options, watchers_count, views_count }`

---

## Infrastructure

### Hardware
- **Scraper host:** LXC on Proxmox (172.16.5.x), residential IP
- **Storage host:** Separate machine (172.16.17.3) — PostgreSQL, Kafka, Garage S3
- **ZFS storage:** lz4 compression (1.16x ratio — mostly incompressible JPEGs)

### Proxies
- 10 residential SOCKS5 proxies (host:19010, user/pass auth)
- Used via `socks-proxy-agent` + `node-fetch`
- NOT used for OLX API (gets 403) or aukro API
- Fetch timeouts: 30s pages/API, 60s image downloads

### Docker Configuration
- Log rotation: `max-size: 50m`, `max-file: 3` in `/etc/docker/daemon.json`
- All scraper images mount to host `/data/images` (shared volume for ingest)
- Hourly cron: `find /data/images -name "*.jpg" -mmin +240 -delete` (cleanup orphans)

### S3 (Garage)
- Endpoint: `172.16.17.3:3900`
- Bucket: `hw5c4n-images`
- Key format: `{platform}/{listing_id}/{index}.jpg`
- ~100 GB, ~1M objects, growing ~5-6 GB/day

### Kafka
- Single broker on storage host
- `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1`
- `KAFKA_ADVERTISED_HOST=172.16.17.3`
- Consumer group: `ingest-v1`

---

## Observability

### observe.js (shared module in all scrapers + ingest)
- **Structured logging:** `createLogger(component)` → `{ ts, level, component, msg, ...extra }`
- **Health state:** Error counters, consecutive failures, last success/error timestamps
- **`/health` endpoint:** Returns 503 when degraded (for uptime monitoring), 200 when ok
- **Telegram alerts:** On consecutive failures via `TELEGRAM_TOKEN` + `TELEGRAM_CHAT_ID`
- **Worker hooks:** `attachWorkerEvents(worker, log)` — BullMQ completed/failed/error
- **Kafka hooks:** `attachKafkaEvents(producer, log)` — timeout/disconnect
- **Poll tracking:** `withPollTracking(pollFn, log)` — wraps controller poll function

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ ES modules |
| HTTP framework | Fastify |
| HTML parsing | Cheerio |
| HTTP client | node-fetch + socks-proxy-agent (scrapers), built-in fetch (OLX API) |
| Job queue | BullMQ + ioredis |
| Message bus | KafkaJS |
| Database | PostgreSQL (pg driver, plain SQL) |
| Object storage | Garage S3 (@aws-sdk/client-s3) |
| Monitoring | Structured JSON logs + Telegram |

---

## Stage 4: AI Classification (NEXT)

### Goal
Add LLM-based product classification and spec extraction as a post-processing step after ingest.

### Approach
- **Model:** Qwen3.5 27B (Q4 quantization, ~16GB VRAM)
- **Deployment:** Local GPU (5090 32GB planned) or RunPod serverless
- **Integration:** Async post-processor consuming from Kafka or polling DB
- **No-think mode** (structured extraction doesn't need chain-of-thought)

### Extraction Pipeline (per listing)

**Call 1 — Classification** (~100 tokens output):
```
Input: title + first 200 chars of description
Output: { category: "GPU" | "CPU" | "RAM" | "HDD" | "SSD" | "Server" | "Monitor" | "Peripheral" | "Networking" | "Desktop" | "Other" }
```

**Call 2 — Spec extraction** (schema depends on category):
```
Input: title + description + params
Output (example for GPU): { brand: "NVIDIA", model: "RTX 3070", vram: "8GB", interface: "PCIe 4.0", condition_notes: "used, working" }
Output (example for HDD): { brand: "Seagate", model: "IronWolf", capacity_gb: 8000, interface: "SATA", rpm: 7200, hours: 45000, type: "NAS" }
```

**Call 3 — Canonical ID** (optional):
```
Input: extracted specs
Output: "nvidia-geforce-rtx-3070-8gb"
```

### Token Budget
- ~600 tokens input, ~150 tokens output per listing
- 5090 at Q4: ~60-70 tok/s → 2-3s per listing
- Full backlog (418k): ~11 days sequential
- Practical: batch by priority, new listings first

### VL Pass (Future)
- Qwen3.5 27B has VL variant
- Second pass on low-confidence extractions only
- Feed product photos to fill gaps (drive labels, model numbers, SMART screenshots)
- Not for initial rollout — too slow for bulk

### Storage
```sql
-- New table for AI-extracted structured data
CREATE TABLE listing_products (
  id SERIAL PRIMARY KEY,
  listing_fk INTEGER REFERENCES listings(id) UNIQUE,
  category VARCHAR(50),
  brand VARCHAR(100),
  model VARCHAR(200),
  canonical_id VARCHAR(200),
  specs JSONB,                    -- Category-specific structured specs
  confidence REAL,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  model_version VARCHAR(50)       -- Track which model/prompt version produced this
);
```

---

## Future Scope

### Broader Category Coverage
Currently scraping one category tree per platform (PC hardware). Expanding to furniture, auto parts, fashion would multiply data volume and commercial value. Same scraper architecture, just more category IDs.

### Cross-Platform Product Matching
Match identical products across platforms (same GPU model in 6 countries) for:
- Cross-border price index
- Arbitrage detection
- Sell-through velocity comparison

### Commercial Data Product
Potential customers:
- **Recommerce companies** (Backmarket, Swappie) — competitive pricing intelligence
- **Price comparison / valuation tools** — real transaction data for "what's my used laptop worth"
- **Market research firms** — secondary electronics market sizing
- **Resellers** — arbitrage opportunities, pricing guidance

### WebUI
Not yet built. Planned: dark theme, listing browser, search, filters, price charts.

### Telegram Notifications
Bot for new listing alerts based on saved searches. Infrastructure ready (Telegram alerts already work for monitoring), needs product logic.

---

## Analysis Reports

Analysis scripts and reports stored in `/root/analysis/`:
- `/root/analysis/tori/2026-03-17/` — Tori.fi market analysis (daily activity, categories, pricing, locations)
- `/root/analysis/storage/2026-03-20/` — Cross-platform storage pricing (HDD/SSD per-TB analysis across all platforms)

---

*Last updated: 2026-04-01*
