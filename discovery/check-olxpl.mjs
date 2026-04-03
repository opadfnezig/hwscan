import { readFileSync } from 'fs';
import * as cheerio from 'cheerio';

const html = readFileSync('discovery/samples/olxpl-listing.html', 'utf-8');
const $ = cheerio.load(html);

// h1 elements avoiding CSS bleed
const h1s = $('h1').map((i,el) => $(el).text().trim()).get().filter(t => t && t.length > 3 && !t.includes('.css'));
console.log('h1 candidates:', h1s.slice(0,3));

const priceEl = $('[data-testid="ad-price-container"] h3');
console.log('Price h3:', priceEl.text().trim().substring(0, 60));

const loc = $('[data-testid="location-breadcrumb"] p');
console.log('Location p:', loc.text().trim().substring(0, 60));

// Check for __NEXT_DATA__
const nextData = $('#__NEXT_DATA__').html();
if (nextData) {
  try {
    const d = JSON.parse(nextData);
    console.log('Has __NEXT_DATA__, keys:', Object.keys(d.props?.pageProps || {}));
  } catch(e) { console.log('__NEXT_DATA__ parse error:', e.message); }
} else {
  console.log('No __NEXT_DATA__');
}

// OLX.pl likely uses JSON in a script tag
$('script[type="application/json"]').each((i, el) => {
  const content = $(el).html();
  if (content && content.includes('title')) {
    try {
      const d = JSON.parse(content);
      console.log('Found JSON script, keys:', Object.keys(d).slice(0, 8));
      if (d.ad) {
        console.log('Ad title:', d.ad.title);
        console.log('Ad price:', d.ad.price);
      }
    } catch(e) {}
  }
});

// Try looking for price by pattern
const priceMatch = html.match(/"price":\s*\{[^}]*"regularPrice":\s*\{[^}]*"value":\s*"([^"]+)"/);
if (priceMatch) console.log('Price from JSON:', priceMatch[1]);

const titleMatch = html.match(/"og:title"\s+content="([^"]+)"/);
if (titleMatch) console.log('OG Title:', titleMatch[1]);

const locationMatch = html.match(/"og:location"\s+content="([^"]+)"/);
if (locationMatch) console.log('OG Location:', locationMatch[1]);
