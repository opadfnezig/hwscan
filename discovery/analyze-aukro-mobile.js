import { readFileSync } from 'fs';
import * as cheerio from 'cheerio';

console.log('📊 Analyzing Aukro Mobile Page Structure\n');

const html = readFileSync('discovery/samples/aukro-mobile.html', 'utf-8');
const $ = cheerio.load(html);

console.log('🔍 Looking for listing elements...\n');

// Try different selectors
const selectors = [
  'article',
  '[class*="listing"]',
  '[class*="item"]',
  '[data-id]',
  '[class*="offer"]',
  '[class*="ad-"]'
];

for (const selector of selectors) {
  const elements = $(selector);
  if (elements.length > 0) {
    console.log(`✅ Selector: ${selector}`);
    console.log(`   Count: ${elements.length}`);

    // Analyze first element
    const first = elements.first();
    console.log(`   First element classes: ${first.attr('class')}`);
    console.log(`   First element tag: ${first.prop('tagName')}`);

    // Try to extract data
    const title = first.find('h2, h3, h4, [class*="title"]').text().trim();
    const price = first.find('[class*="price"], [class*="cena"]').text().trim();
    const link = first.find('a').attr('href');

    if (title) console.log(`   Sample title: ${title.substring(0, 60)}`);
    if (price) console.log(`   Sample price: ${price}`);
    if (link) console.log(`   Sample link: ${link}`);

    console.log('');
  }
}

// Look for specific auction/listing patterns
console.log('🔍 Looking for auction-specific elements...\n');

const auctionMarkers = [
  'aukce',
  'auction',
  'kup teď',
  'buy now',
  'konec za',
  'ending'
];

auctionMarkers.forEach(marker => {
  const found = $(`*:contains("${marker}")`).length;
  if (found > 0) {
    console.log(`✅ Found "${marker}": ${found} occurrences`);
  }
});

console.log('\n🔍 Page metadata...\n');
console.log(`Title: ${$('title').text()}`);
console.log(`Meta description: ${$('meta[name="description"]').attr('content')}`);

// Check if it's the real page or still a challenge
const bodyText = $('body').text().toLowerCase();
if (bodyText.includes('cloudflare') && bodyText.includes('checking')) {
  console.log('\n⚠️  WARNING: This looks like a Cloudflare challenge page!');
} else if (bodyText.includes('just a moment')) {
  console.log('\n⚠️  WARNING: This looks like a Cloudflare challenge page!');
} else {
  console.log('\n✅ This appears to be real content (no Cloudflare challenge detected)');
}

// Sample listing extraction
console.log('\n📦 Sample Listing Extraction:\n');

$('article').slice(0, 3).each((i, elem) => {
  const $elem = $(elem);

  console.log(`Listing ${i + 1}:`);
  console.log(`  Title: ${$elem.find('h2, h3, h4').text().trim().substring(0, 60)}`);
  console.log(`  Price: ${$elem.find('[class*="price"]').text().trim()}`);
  console.log(`  Link: ${$elem.find('a').attr('href')}`);
  console.log('');
});

console.log('✅ Analysis complete!');
