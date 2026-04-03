import { getAgent, UA } from './proxy.js';
import { API_BASE, CATEGORY_ID, DOMAIN, ROLE } from './config.js';

// Use Node 20 built-in fetch (undici) — different TLS fingerprint than node-fetch,
// avoids CloudFront WAF blocks on the OLX API.
const apiFetch = globalThis.fetch;

const API_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': `https://www.${DOMAIN}/`,
  'Origin': `https://www.${DOMAIN}`,
  'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120", "Not:A-Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

// ─── Category polling ─────────────────────────────────────────────────────────

/**
 * Fetch one page of category listings sorted newest-first.
 * Returns { listings: [{id, url}], hasMore: bool }
 *
 * OLX API caps at 1000 accessible results (offset limit).
 * For new-listing detection we only need page 1 (offset=0).
 */
export async function fetchCategoryPage(offset = 0, limit = 50) {
  const url = `${API_BASE}/offers/?category_id=${CATEGORY_ID}&sort_by=created_at:desc&limit=${limit}&offset=${offset}`;
  const res = await apiFetch(url, {
    headers: API_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Category API HTTP ${res.status} for ${DOMAIN}: ${body.slice(0, 500)}`);
  }

  const { data, links, metadata } = await res.json();

  // metadata.source.organic contains indices of non-promoted results.
  // If empty/absent, all results are organic.
  const organicSet = new Set(metadata?.source?.organic ?? []);
  const listings = data
    .filter((_, i) => organicSet.size === 0 || organicSet.has(i))
    .map(offer => ({ id: offer.id, url: offer.url }));

  return { listings, hasMore: !!links?.next };
}

// ─── Listing detail ───────────────────────────────────────────────────────────

/**
 * Fetch a single listing by its numeric ID.
 * Returns { deleted: true } or { deleted: false, data: <parsed offer> }
 */
export async function fetchListing(listingId) {
  const url = `${API_BASE}/offers/${listingId}/`;
  const res = await apiFetch(url, {
    headers: API_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 404 || res.status === 410) return { deleted: true };
  if (!res.ok) throw new Error(`Offer API HTTP ${res.status} for id=${listingId}`);

  const { data: offer } = await res.json();

  // Inactive/expired listings show status !== 'active'
  if (offer.status !== 'active') return { deleted: true };

  return { deleted: false, data: parseOffer(offer) };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseOffer(offer) {
  const priceParam = offer.params?.find(p => p.key === 'price');

  // All params except price (which gets its own top-level fields)
  const params = (offer.params ?? [])
    .filter(p => p.key !== 'price')
    .map(p => ({
      key:   p.key,
      name:  p.name,
      value: p.value?.label ?? p.value?.key ?? null,
    }))
    .filter(p => p.value !== null);

  // Full-res images from Apollo CDN
  const image_urls = (offer.photos ?? []).map(
    p => `https://ireland.apollo.olxcdn.com:443/v1/files/${p.filename}/image`,
  );

  const u = offer.user ?? {};

  return {
    listing_id:      String(offer.id),
    url:             offer.url,
    title:           offer.title,
    description:     offer.description ?? '',
    created_at:      offer.created_time,
    refreshed_at:    offer.last_refresh_time,

    // Price
    price:           priceParam?.value?.value ?? null,
    price_label:     priceParam?.value?.label ?? null,
    currency:        priceParam?.value?.currency ?? null,   // 'UAH' or 'PLN'
    negotiable:      priceParam?.value?.negotiable ?? false,
    arranged:        priceParam?.value?.arranged ?? false,  // price on request

    // Condition from params
    condition:       offer.params?.find(p => p.key === 'state')?.value?.label ?? null,

    // Structured params (all non-price fields: RAM, OS, CPU, screen size, etc.)
    params,

    // Location
    location_city:   offer.location?.city?.name   ?? null,
    location_region: offer.location?.region?.name ?? null,

    // Images (URLs — workers download to disk)
    image_urls,

    // Seller
    seller: {
      id:           u.id,
      name:         u.name,
      since:        u.created,
      company_name: u.company_name || null,
      about:        u.about       || null,
      logo:         u.logo_ad_page || u.logo || null,
      is_business:  offer.business ?? false,
      is_online:    u.is_online   ?? false,
      last_seen:    u.last_seen   ?? null,
    },

    // Delivery methods
    delivery: {
      courier:  (offer.contact?.courier)         ?? false,  // seller accepts courier
      olx_rock: (offer.delivery?.rock?.active)   ?? false,  // OLX's own delivery system
    },

    // Contact options
    contact: {
      phone:       (offer.contact?.phone)       ?? false,
      chat:        (offer.contact?.chat)        ?? false,
      negotiation: (offer.contact?.negotiation) ?? false,
    },

    promoted: (offer.promotion?.top_ad || offer.promotion?.highlighted) ?? false,
    domain:   DOMAIN,
  };
}
