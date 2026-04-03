import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import { getAgent, UA } from './proxy.js';
import { API_BASE, CATEGORY_SEO_URL } from './config.js';

function makeHeaders() {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'x-aukro-client': 'platform-frontend',
    'x-aukro-token': randomUUID(),
    'x-accept-subbrand': 'BAZAAR',
    'x-accept-currency': 'CZK',
    'x-accept-language': 'cs-CZ',
    'x-aukro-platform-type': 'WEB',
  };
}

const FETCH_OPTS = () => ({ agent: getAgent(), timeout: 30000 });

// ─── Category search ──────────────────────────────────────────────────────

/**
 * Fetch a page of category listings.
 * Returns { listings: [{id, name}], totalElements }
 *
 * Sort defaults to relevance (API ignores sort overrides).
 * Relevance includes freshness factor — newest items appear near top.
 */
export async function fetchCategoryPage(pageNum = 0, pageSize = 60) {
  const url = `${API_BASE}/offers/searchItemsCommon?page=${pageNum}&size=${pageSize}`;
  const res = await fetch(url, {
    ...FETCH_OPTS(),
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify({
      categorySeoUrl: CATEGORY_SEO_URL,
      subbrandExclusive: false,
      fallbackItemsCount: 0,
      splitGroups: {},
    }),
  });

  if (!res.ok) throw new Error(`Search API HTTP ${res.status}`);

  const data = await res.json();
  const listings = (data.content || []).map(item => ({
    id: String(item.itemId),
    name: item.itemName,
  }));

  return {
    listings,
    totalElements: data.page?.totalElements ?? 0,
  };
}

// ─── Listing detail ───────────────────────────────────────────────────────

/**
 * Fetch full listing detail by numeric ID.
 * Returns:
 *   { deleted: true }                    — HTTP 404 (truly gone from API)
 *   { ended: true, data: {...} }         — state is ENDED (auction finished, data still available)
 *   { deleted: false, data: {...} }      — state is ACTIVE
 */
export async function fetchListing(listingId) {
  const url = `${API_BASE}/offers/${listingId}/offerDetail?pageType=DETAIL&requestedFor=DETAIL`;
  const res = await fetch(url, {
    ...FETCH_OPTS(),
    headers: makeHeaders(),
  });

  if (res.status === 404) return { deleted: true };
  if (!res.ok) throw new Error(`Offer API HTTP ${res.status} for id=${listingId}`);

  const offer = await res.json();

  if (offer.state === 'ENDED') return { ended: true, data: parseOffer(offer) };
  if (offer.state !== 'ACTIVE') return { deleted: true };

  return { deleted: false, data: parseOffer(offer) };
}

/**
 * Fetch auction bid history.
 * Returns array of { amount, currency, bidder_name, bidder_rating, bidder_star, bid_time, proxy_time }
 */
export async function fetchBidHistory(listingId) {
  const url = `${API_BASE}/bids/${listingId}/bidHistory`;
  try {
    const res = await fetch(url, {
      ...FETCH_OPTS(),
      headers: makeHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.bidsHistory || []).map(b => ({
      amount:        b.amount?.amount ?? 0,
      currency:      b.amount?.currency ?? 'CZK',
      bidder_name:   b.userRatingDto?.userName ?? null,
      bidder_rating: b.userRatingDto?.rating ?? null,
      bidder_star:   b.userRatingDto?.starType ?? null,
      bid_time:      b.time,
      proxy_time:    b.proxyAmountDate ?? null,
    }));
  } catch {
    return [];
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────

function parseOffer(o) {
  // Original images from CDN
  const image_urls = (o.itemImages || [])
    .sort((a, b) => a.position - b.position)
    .map(img => img.sizes?.ORIGINAL?.url)
    .filter(Boolean);

  // Structured attributes (condition, delivery time, etc.)
  const params = (o.attributes || []).map(a => ({
    key:   a.attributeId,
    name:  a.attributeName,
    value: a.attributeValue,
  }));

  const seller = o.seller || {};

  return {
    listing_id:      String(o.itemId),
    url:             `https://aukro.cz/${o.seoUrl}-${o.itemId}`,
    title:           o.name || '',
    description:     o.descriptionStripped || '',

    // itemType: BIDDING = auction, BUYNOW = fixed price
    item_type:       o.itemType,                                         // 'BIDDING' | 'BUYNOW'
    price:           o.itemType === 'BIDDING' ? (o.price?.amount ?? null) : (o.buyNowPrice?.amount ?? null),
    currency:        (o.price?.currency || o.buyNowPrice?.currency) || 'CZK',
    auction_price:   o.itemType === 'BIDDING' ? (o.price?.amount ?? null) : null,
    buy_now_price:   o.buyNowActive ? (o.buyNowPrice?.amount ?? null) : null,
    bidders_count:   o.biddersCount ?? 0,
    best_offer:      o.bestOfferEnabled ?? false,

    // Quantity (for multi-item listings)
    quantity:          o.quantity ?? 1,
    starting_quantity: o.startingQuantity ?? 1,
    sold_quantity:     o.soldQuantity ?? 0,
    infinite_order:    o.infiniteOrder ?? false,                          // auto-relisting

    condition:       params.find(p => p.name === 'Stav zboží')?.value ?? null,

    // Dates
    started_at:      o.startingTime ?? null,
    ending_at:       o.endingTime ?? null,

    // Category
    category_path:   (o.category || []).map(c => c.name).join(' > '),

    // Params
    params,

    // Location
    location:        o.itemLocation || null,

    // Images
    image_urls,

    // Seller
    seller: {
      id:                    seller.userId,
      name:                  seller.showName,
      rating:                seller.rating,
      star_type:             seller.starType,
      positive_pct:          seller.positiveFeedbackPercentage,
      feedback_count:        seller.feedbackUniqueUserCount,
      is_company:            seller.companyAccount ?? false,
      avatar:                seller.avatarUrl ?? null,
    },

    // Shipping
    shipping_options: (o.shippingOptions || []).map(s => ({
      method:  s.shippingMethodName,
      code:    s.shippingMethodCode,
      price:   s.firstPackagePrice?.amount,
    })),

    // Flags
    watchers_count:  o.watchingUserCount ?? 0,
    views_count:     o.displayedCount ?? 0,
  };
}
