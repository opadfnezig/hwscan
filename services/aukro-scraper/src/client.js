import { randomUUID } from 'crypto';
import { scrapeJSON } from './anthill.js';
import { API_BASE, CATEGORY_SEO_URL } from './config.js';

const AUKRO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'x-aukro-client': 'platform-frontend',
  'x-aukro-token': randomUUID(),
  'x-accept-subbrand': 'BAZAAR',
  'x-accept-currency': 'CZK',
  'x-accept-language': 'cs-CZ',
  'x-aukro-platform-type': 'WEB',
};

const ANTHILL_OPTS = { proxy: true, headers: AUKRO_HEADERS, timeout: 30000 };

// ─── Category search ──────────────────────────────────────────────────────

export async function fetchCategoryPage(pageNum = 0, pageSize = 60) {
  const url = `${API_BASE}/offers/searchItemsCommon?page=${pageNum}&size=${pageSize}`;
  const data = await scrapeJSON(url, {
    ...ANTHILL_OPTS,
    method: 'POST',
    body: JSON.stringify({
      categorySeoUrl: CATEGORY_SEO_URL,
      subbrandExclusive: false,
      fallbackItemsCount: 0,
      splitGroups: {},
    }),
  });

  const listings = (data.content || []).map(item => ({
    id: String(item.itemId),
    name: item.itemName,
  }));

  return { listings, totalElements: data.page?.totalElements ?? 0 };
}

// ─── Listing detail ───────────────────────────────────────────────────────

export async function fetchListing(listingId) {
  const url = `${API_BASE}/offers/${listingId}/offerDetail?pageType=DETAIL&requestedFor=DETAIL`;
  const data = await scrapeJSON(url, ANTHILL_OPTS);

  if (data._notFound) return { deleted: true };
  if (data.state === 'ENDED') return { ended: true, data: parseOffer(data) };
  if (data.state !== 'ACTIVE') return { deleted: true };

  return { deleted: false, data: parseOffer(data) };
}

// ─── Bid history ──────────────────────────────────────────────────────────

export async function fetchBidHistory(listingId) {
  const url = `${API_BASE}/bids/${listingId}/bidHistory`;
  try {
    const data = await scrapeJSON(url, ANTHILL_OPTS);
    if (data._notFound) return [];
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
  const image_urls = (o.itemImages || [])
    .sort((a, b) => a.position - b.position)
    .map(img => img.sizes?.ORIGINAL?.url)
    .filter(Boolean);

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
    item_type:       o.itemType,
    price:           o.itemType === 'BIDDING' ? (o.price?.amount ?? null) : (o.buyNowPrice?.amount ?? null),
    currency:        (o.price?.currency || o.buyNowPrice?.currency) || 'CZK',
    auction_price:   o.itemType === 'BIDDING' ? (o.price?.amount ?? null) : null,
    buy_now_price:   o.buyNowActive ? (o.buyNowPrice?.amount ?? null) : null,
    bidders_count:   o.biddersCount ?? 0,
    best_offer:      o.bestOfferEnabled ?? false,
    quantity:          o.quantity ?? 1,
    starting_quantity: o.startingQuantity ?? 1,
    sold_quantity:     o.soldQuantity ?? 0,
    infinite_order:    o.infiniteOrder ?? false,
    condition:       params.find(p => p.name === 'Stav zboží')?.value ?? null,
    started_at:      o.startingTime ?? null,
    ending_at:       o.endingTime ?? null,
    category_path:   (o.category || []).map(c => c.name).join(' > '),
    params,
    location:        o.itemLocation || null,
    image_urls,
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
    shipping_options: (o.shippingOptions || []).map(s => ({
      method:  s.shippingMethodName,
      code:    s.shippingMethodCode,
      price:   s.firstPackagePrice?.amount,
    })),
    watchers_count:  o.watchingUserCount ?? 0,
    views_count:     o.displayedCount ?? 0,
  };
}
