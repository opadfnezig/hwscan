import { parsePrice } from './price.js';

// Normalize any platform event → common row shape.
// Returns { platform, listing_id, url, title, description, price, currency,
//           negotiable, location, seller_name, condition, posted_at, scraped_at,
//           image_paths, is_deleted, extras }

export function normalizeEvent(event) {
  const p = event.platform;
  if (p === 'bazos.cz' || p === 'bazos.sk') return normalizeBazos(event);
  if (p === 'kleinanzeigen.de')              return normalizeKleinanzeigen(event);
  if (p === 'olx.ua' || p === 'olx.pl')     return normalizeOlx(event);
  if (p === 'tori.fi')                       return normalizeTori(event);
  if (p === 'aukro.cz')                      return normalizeAukro(event);
  throw new Error(`Unknown platform: ${p}`);
}

function normalizeBazos(e) {
  const fallback = e.platform === 'bazos.sk' ? 'EUR' : 'CZK';
  const { amount, currency, negotiable } = parsePrice(e.price_raw, fallback);
  return {
    platform:    e.platform,
    listing_id:  String(e.listing_id),
    url:         e.url,
    title:       e.title,
    description: e.description,
    price:       amount,
    currency:    currency ?? fallback,
    negotiable,
    location:    e.location ?? null,
    seller_name: e.seller_name ?? null,
    condition:   null,
    posted_at:   e.posted_at ? new Date(e.posted_at) : null,
    scraped_at:  new Date(e.scraped_at),
    image_paths: e.image_paths ?? [],
    is_deleted:  e.event === 'listing.deleted',
    extras: {
      views:     e.views,
      price_raw: e.price_raw,
      ...(e.last_known ? { last_known: e.last_known } : {}),
    },
  };
}

function parseGermanDate(str) {
  if (!str) return null;
  // "04.03.2026" → 2026-03-04
  const m = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeKleinanzeigen(e) {
  const { amount, currency, negotiable } = parsePrice(e.price_raw, 'EUR');
  return {
    platform:    'kleinanzeigen.de',
    listing_id:  String(e.listing_id),
    url:         e.url,
    title:       e.title,
    description: e.description,
    price:       amount,
    currency:    currency ?? 'EUR',
    negotiable,
    location:    e.location ?? null,
    seller_name: e.seller_name ?? null,
    condition:   null,
    posted_at:   parseGermanDate(e.posted_at),
    scraped_at:  new Date(e.scraped_at),
    image_paths: e.image_paths ?? [],
    is_deleted:  e.event === 'listing.deleted',
    extras: {
      params:             e.params,
      shipping_available: e.shipping_available,
      shipping_raw:       e.shipping_raw,
      seller_id:          e.seller_id,
      seller_url:         e.seller_url,
      price_raw:          e.price_raw,
    },
  };
}

function normalizeOlx(e) {
  return {
    platform:    e.platform,
    listing_id:  String(e.listing_id),
    url:         e.url,
    title:       e.title,
    description: e.description,
    price:       e.price ?? null,
    currency:    e.currency ?? null,
    negotiable:  e.negotiable ?? false,
    location:    [e.location_city, e.location_region].filter(Boolean).join(', ') || null,
    seller_name: e.seller?.name ?? null,
    condition:   e.condition ?? null,
    posted_at:   e.created_at ? new Date(e.created_at) : null,
    scraped_at:  new Date(e.scraped_at),
    image_paths: e.image_paths ?? [],
    is_deleted:  e.event === 'listing.deleted',
    extras: {
      params:       e.params,
      arranged:     e.arranged,
      refreshed_at: e.refreshed_at,
      seller:       e.seller,
      delivery:     e.delivery,
      contact:      e.contact,
      promoted:     e.promoted,
      price_label:  e.price_label,
    },
  };
}

function normalizeTori(e) {
  const isDeleted = e.event === 'listing.deleted' || e.event === 'listing.sold';
  return {
    platform:    'tori.fi',
    listing_id:  String(e.listing_id),
    url:         e.url,
    title:       e.title,
    description: e.description,
    price:       e.price ?? null,
    currency:    e.currency ?? 'EUR',
    negotiable:  false,
    location:    e.location ?? null,
    seller_name: null,
    condition:   e.condition ?? null,
    posted_at:   null,
    scraped_at:  new Date(e.scraped_at),
    image_paths: e.image_paths ?? [],
    is_deleted:  isDeleted,
    extras: {
      category_path:  e.category_path,
      deleted_reason: e.deleted_reason ?? null,
    },
  };
}

function normalizeAukro(e) {
  return {
    platform:    'aukro.cz',
    listing_id:  String(e.listing_id),
    url:         e.url,
    title:       e.title,
    description: e.description,
    price:       e.price ?? null,
    currency:    e.currency ?? 'CZK',
    negotiable:  false,
    location:    e.location ?? null,
    seller_name: e.seller?.name ?? null,
    condition:   e.condition ?? null,
    posted_at:   e.started_at ? new Date(e.started_at) : null,
    scraped_at:  new Date(e.scraped_at),
    image_paths: e.image_paths ?? [],
    is_deleted:  e.event === 'listing.deleted' || e.event === 'listing.ended',
    ending_at:   e.ending_at ?? null,
    bid_history: e.bid_history ?? [],
    extras: {
      item_type:        e.item_type,
      auction_price:    e.auction_price,
      buy_now_price:    e.buy_now_price,
      bidders_count:    e.bidders_count,
      best_offer:       e.best_offer,
      quantity:         e.quantity,
      ending_at:        e.ending_at,
      sold_quantity:    e.sold_quantity,
      category_path:    e.category_path,
      params:           e.params,
      seller:           e.seller,
      shipping_options: e.shipping_options,
      watchers_count:   e.watchers_count,
      views_count:      e.views_count,
    },
  };
}
