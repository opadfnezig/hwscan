import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { getAgent } from './proxy.js';
import { BASE_URL, DOMAIN_SUFFIX } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_OPTS = {
  headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'cs,sk;q=0.9,en;q=0.5',
  },
  redirect: 'follow',
  timeout: 30000,
  // agent attached per-call via getAgent()
};

// ─── Category page ─────────────────────────────────────────────────────────

// Bazos category pagination is path-based: page 1 = BASE_URL, page N = BASE_URL{(N-1)*20}/
function categoryUrl(pageNum) {
  const offset = (pageNum - 1) * 20;
  return offset === 0 ? BASE_URL : `${BASE_URL}${offset}/`;
}

// Returns { urls: string[], pageNum: number }
// Each listing link appears twice (image href + title href) — deduplicated.
export async function scrapeCategoryPage(pageNum = 1) {
  const url = categoryUrl(pageNum);
  const response = await fetch(url, { ...FETCH_OPTS, agent: getAgent() });

  if (!response.ok) {
    throw new Error(`Category page ${pageNum} (${url}): HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  const urls = [];

  $('a[href*="/inzerat/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);
    urls.push(href.startsWith('http') ? href : new URL(href, BASE_URL).href);
  });

  return { urls, pageNum };
}

// ─── Listing page ──────────────────────────────────────────────────────────

function extractListingId(url) {
  const m = url.match(/\/inzerat\/(\d+)\//);
  return m ? m[1] : null;
}

function parseMetadata($) {
  let seller = null, location = null, views = null, postedAt = null;

  $('table td').each((_, el) => {
    const text = $(el).text().trim();
    // Czech: Jméno / Vidělo / Vloženo   Slovak: Meno / Videlo / Vložené
    if (text.startsWith('Jméno:') || text.startsWith('Meno:'))
      seller = text.slice(text.indexOf(':') + 1).trim();
    if (text.startsWith('Lokalita:'))
      location = text.slice(9).trim();
    if (text.startsWith('Vidělo:') || text.startsWith('Videlo:'))
      views = parseInt(text.match(/(\d[\d\s]*)/)?.[1]?.replace(/\s/g, '')) || null;
    if (text.startsWith('Vloženo:') || text.startsWith('Vložené:'))
      postedAt = text.slice(text.indexOf(':') + 1).trim();
  });

  return { seller, location, views, postedAt };
}

function parseImages($) {
  const urls = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    // Full-res listing images: bazos.{cz,sk}/img/1/{suffix}/{id}.jpg
    // Exclude: /img/1t/ (thumbnails), .svg, external domains
    if (
      src.includes(`bazos.${DOMAIN_SUFFIX}/img/`) &&
      !src.includes('/img/1t/') &&
      !src.includes('.svg')
    ) {
      urls.push(src);
    }
  });
  return urls;
}

// Returns { deleted: true } or { deleted: false, data: ListingData }
export async function scrapeListing(url) {
  const response = await fetch(url, { ...FETCH_OPTS, agent: getAgent() });

  // After redirect-follow, if the final URL no longer contains /inzerat/ the listing was removed.
  if (!response.url.includes('/inzerat/')) {
    return { deleted: true };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Sanity check — a valid listing always has h1.nadpisdetail
  const title = $('h1.nadpisdetail').first().text().trim();
  if (!title) return { deleted: true };

  const listingId = extractListingId(url);

  // First .inzeratycena is the listing price; others are sidebar recommendations
  const priceRaw = $('.inzeratycena').first()
    .find('span[translate="no"]').text().trim()
    || $('.inzeratycena').first().text().trim().split('\n')[0].trim();

  const description = $('.popisdetail').first().text().trim();

  const { seller, location, views, postedAt } = parseMetadata($);
  const imageUrls = parseImages($);

  return {
    deleted: false,
    data: {
      listing_id: listingId,
      url,
      title,
      price_raw: priceRaw,
      description,
      seller_name: seller,
      location,
      views,
      posted_at: postedAt,
      image_urls: imageUrls,
    },
  };
}
