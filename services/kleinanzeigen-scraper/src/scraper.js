import * as cheerio from 'cheerio';
import { scrapeHTML } from './anthill.js';
import { categoryPageUrl } from './config.js';

// Extract listing ID from URL: /s-anzeige/{slug}/{id}-{cat}-{loc}
function idFromUrl(url) {
  const m = url.match(/\/(\d+)-\d+-\d+(?:$|\?)/);
  return m ? m[1] : null;
}

// ─── Category page ───────────────────────────────────────────────────────────

export async function scrapeCategoryPage(baseUrl, pageNum = 1) {
  const url = categoryPageUrl(baseUrl, pageNum);
  const data = await scrapeHTML(url, { engine: 'axios', proxy: true });
  const $ = cheerio.load(data.body);

  const listings = [];
  $('article.aditem').each((_, el) => {
    const adid = $(el).attr('data-adid');
    const href = $(el).find('a[href*="/s-anzeige/"]').first().attr('href');
    if (adid && href) {
      listings.push({
        listing_id: adid,
        url: 'https://www.kleinanzeigen.de' + href,
      });
    }
  });

  return { listings, pageNum, sourceUrl: url };
}

// ─── Listing page ─────────────────────────────────────────────────────────────

export async function scrapeListing(url) {
  const data = await scrapeHTML(url, { engine: 'axios', proxy: true });
  const html = data.body;

  // Deletion check: page_type eVIP = deleted/expired
  const pageTypeMatch = html.match(/"page_type"\s*:\s*"([^"]+)"/);
  if (pageTypeMatch?.[1] === 'eVIP') {
    return { deleted: true };
  }

  const $ = cheerio.load(html);

  // Deactivated/sold listings still return 200 with badge-unavailable
  if ($('.badge-unavailable').length > 0) {
    return { deleted: true };
  }

  // Core fields
  const title       = $('#viewad-title').text().trim();
  const price_raw   = $('#viewad-price').text().trim();
  const location    = $('#viewad-locality').text().trim();
  const posted_at   = $('#viewad-extra-info span').first().text().trim();
  const description = $('#viewad-description-text').text().trim();

  // Shipping
  const shipping_raw = $('.boxedarticle--details--shipping').text().trim();
  const shipping_available = !shipping_raw.includes('Nur Abholung');

  // Structured params (Art, Zustand, etc.)
  const params = {};
  $('.addetailslist--detail').each((_, el) => {
    const label = $(el).clone().children('.addetailslist--detail--value').remove().end().text().trim();
    const value = $(el).find('.addetailslist--detail--value').text().trim();
    if (label) params[label] = value;
  });

  // Seller
  const sellerAnchor = $('#viewad-contact a[href*="bestandsliste"]').first();
  const seller_name  = sellerAnchor.text().trim() || $('#viewad-contact .userprofile-vip a').first().text().trim();
  const sellerHref   = sellerAnchor.attr('href') || '';
  const sellerIdMatch = sellerHref.match(/userId=(\d+)/);
  const seller_id    = sellerIdMatch ? sellerIdMatch[1] : null;
  const seller_url   = seller_id ? `https://www.kleinanzeigen.de/s-bestandsliste.html?userId=${seller_id}` : null;

  // Images — keep rule param (CDN requires it)
  const image_urls = [];
  $('.galleryimage-element img[itemprop="image"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-imgsrc');
    if (src) {
      image_urls.push(src);
    }
  });

  // Listing ID from URL (use final redirect URL if available)
  const finalUrl = data.url || url;
  const listing_id = idFromUrl(url) || idFromUrl(finalUrl);

  return {
    deleted: false,
    data: {
      listing_id,
      url,
      title,
      price_raw,
      location,
      posted_at,
      description,
      shipping_available,
      shipping_raw,
      params,
      seller_name,
      seller_id,
      seller_url,
      image_urls,
    },
  };
}
