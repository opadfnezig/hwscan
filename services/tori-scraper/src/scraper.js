import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { getAgent, UA } from './proxy.js';
import { BASE_URL, CATEGORY_PARAM } from './config.js';

const FETCH_OPTS = () => ({
  agent: getAgent(),
  redirect: 'follow',
  timeout: 30000,
  headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'fi-FI,fi;q=0.9,en;q=0.5',
  },
});

// ─── Category page ─────────────────────────────────────────────────────────

/**
 * Fetch a category page and extract listing IDs + URLs from the
 * dehydrated React Query state (base64-encoded JSON blob).
 *
 * Returns { listings: [{id, url}], pageNum }
 */
export async function scrapeCategoryPage(pageNum = 1) {
  const url = `${BASE_URL}/recommerce/forsale/search?${CATEGORY_PARAM}&sort=PUBLISHED_DESC&page=${pageNum}`;
  const res = await fetch(url, FETCH_OPTS());
  if (!res.ok) throw new Error(`Category page ${pageNum}: HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Find the large unnamed JSON script — dehydrated React Query state
  let rawContent = null;
  $('script[type="application/json"]').each((_, el) => {
    const c = $(el).html() || '';
    if (c.length > 50000 && !$(el).attr('id')) rawContent = c;
  });

  if (!rawContent) return { listings: [], pageNum };

  // Decode: may be raw JSON or base64-encoded JSON
  let decoded;
  try {
    decoded = JSON.parse(rawContent);
  } catch {
    decoded = JSON.parse(Buffer.from(rawContent, 'base64').toString('utf-8'));
  }

  // Extract listings from React Query docs
  const listings = [];
  if (decoded.queries) {
    for (const q of decoded.queries) {
      const docs = q.state?.data?.docs;
      if (Array.isArray(docs) && docs.length > 0 && docs[0].ad_id) {
        for (const doc of docs) {
          listings.push({
            id: String(doc.ad_id),
            url: doc.canonical_url || `${BASE_URL}/recommerce/forsale/item/${doc.ad_id}`,
          });
        }
        break; // Only need the first matching query
      }
    }
  }

  return { listings, pageNum };
}

// ─── Listing page ──────────────────────────────────────────────────────────

/**
 * Fetch a single listing page.
 * Returns { deleted: true } or { deleted: false, data: {...} }
 *
 * Detection:
 *   HTTP 404           → deleted
 *   "Myyty" badge      → sold (treated as deleted)
 *   No LD+JSON Product → sold/expired (treated as deleted)
 */
export async function scrapeListing(listingId, url) {
  const res = await fetch(url, FETCH_OPTS());

  if (res.status === 404) return { deleted: true, reason: 'removed' };
  if (!res.ok) throw new Error(`Listing ${listingId}: HTTP ${res.status}`);

  const html = await res.text();

  // Sold detection: "Myyty" badge in HTML
  if (html.includes('>Myyty<')) return { deleted: true, reason: 'sold' };

  const $ = cheerio.load(html);

  // LD+JSON Product — primary structured data source
  let product = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).html());
      if (d['@type'] === 'Product') product = d;
    } catch {}
  });

  // No Product LD+JSON = expired/removed (no Myyty badge = not sold)
  if (!product) return { deleted: true, reason: 'expired' };

  const title       = product.name || '';
  const description = product.description || '';
  const price       = parseFloat(product.offers?.price) || null;
  const currency    = product.offers?.priceCurrency || 'EUR';
  const condition   = conditionLabel(product.itemCondition);

  // Category path from additionalProperty
  const categoryPath = product.additionalProperty
    ?.find(p => p.name === 'category')?.value || null;

  // Images from HTML (LD+JSON only has 1 image)
  const image_urls = [];
  $('[data-testid^="image-"]').each((_, el) => {
    const img = $(el).find('img');
    const src = img.attr('src') || img.attr('data-src') || '';
    if (src && src.includes('img.tori.net')) {
      // Strip any size prefix to get full-res URL
      image_urls.push(src.replace(/\/dynamic\/\d+w\//, '/dynamic/default/'));
    }
  });
  // Fallback to LD+JSON image if none found in HTML
  if (image_urls.length === 0 && product.image) {
    image_urls.push(product.image.replace(/\/dynamic\/\d+w\//, '/dynamic/default/'));
  }

  // Description from HTML as fallback (if LD+JSON was truncated)
  const htmlDesc = $('[data-testid="description"]').text().trim();
  const fullDescription = htmlDesc.length > description.length ? htmlDesc : description;

  // Location from HTML
  const location = $('[data-testid="object-address"]').text().trim() || null;

  return {
    deleted: false,
    data: {
      listing_id:  String(listingId),
      url,
      title,
      description: fullDescription,
      price,
      currency,
      condition,
      category_path: categoryPath,
      location,
      image_urls,
    },
  };
}

function conditionLabel(schemaUrl) {
  if (!schemaUrl) return null;
  if (schemaUrl.includes('New'))           return 'New';
  if (schemaUrl.includes('Used'))          return 'Used';
  if (schemaUrl.includes('Refurbished'))   return 'Refurbished';
  if (schemaUrl.includes('Damaged'))       return 'Damaged';
  return schemaUrl.split('/').pop() || null;
}
