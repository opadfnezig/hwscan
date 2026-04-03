import fetch from 'node-fetch';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.kleinanzeigen.de';
// PC hardware category - was "Computer" under "Elektronik"
const CATEGORY_URL = `${BASE_URL}/s-computer-zubehoer/c161+cat_161`;
const PC_CATEGORY_URL = `${BASE_URL}/s-computer/c228`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'kleinanzeigen.de',
  timestamp: new Date().toISOString(),
  tests: [],
  structure: {},
  issues: [],
  samples: [],
  categories: []
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url, description) {
  console.log(`\n📡 Fetching: ${description}`);
  console.log(`   URL: ${url}`);
  const startTime = Date.now();
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      },
      validateStatus: () => true,
      timeout: 15000
    });

    const elapsed = Date.now() - startTime;
    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    const result = {
      description,
      url,
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      responseTime: elapsed,
      contentLength: html.length,
      contentType: response.headers['content-type'],
      server: response.headers['server'],
      cfRay: response.headers['cf-ray']
    };

    const icon = result.ok ? '✅' : '❌';
    console.log(`   ${icon} Status: ${response.status} (${elapsed}ms, ${(html.length / 1024).toFixed(1)}KB)`);
    if (result.cfRay) console.log(`   ⚠️  Cloudflare detected`);

    findings.tests.push(result);
    return { html, result };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    findings.tests.push({ description, url, error: error.message, ok: false });
    findings.issues.push({ test: description, error: error.message });
    return { error };
  }
}

async function analyzeHomepage() {
  console.log('\n🔍 TESTING BASIC CONNECTIVITY');

  const { html, result, error } = await fetchPage(BASE_URL, 'Homepage');
  if (error) return;

  if (!result.ok) {
    console.log(`   ⚠️  Homepage returned ${result.status}`);
    return;
  }

  const $ = cheerio.load(html);
  console.log(`   Page title: ${$('title').text()}`);

  // Check for anti-bot
  const body = html.toLowerCase();
  findings.structure.homepage = {
    accessible: result.ok,
    hasCloudflare: !!result.cfRay,
    hasCaptcha: body.includes('captcha') || body.includes('recaptcha')
  };
}

async function analyzeCategoryPage() {
  console.log('\n🔍 ANALYZING COMPUTER ACCESSORIES CATEGORY');

  await sleep(1000);
  const { html, error, result } = await fetchPage(CATEGORY_URL, 'Computer accessories category');
  if (error) return;

  if (!result.ok) {
    console.log(`   Trying PC category instead...`);
    await sleep(1000);
    const r2 = await fetchPage(PC_CATEGORY_URL, 'PC category');
    if (r2.error || !r2.result.ok) return;
    return analyzeHtml(r2.html, 'olxpl-cat-fallback');
  }

  writeFileSync('discovery/samples/kleinanzeigen-category.html', html);
  findings.samples.push('kleinanzeigen-category.html');
  await analyzeHtml(html, null);
}

async function analyzeHtml(html, saveAs) {
  if (saveAs) {
    writeFileSync(`discovery/samples/${saveAs}.html`, html);
    findings.samples.push(`${saveAs}.html`);
  }

  const $ = cheerio.load(html);
  const structure = { subcategories: [], listingCards: 0, listingSelector: null, pagination: {} };

  // Look for total count
  console.log('\n📊 Looking for total count...');
  const countTexts = ['h1', 'h2', '.header-main', '#srchrslt-adtable'];
  for (const sel of countTexts) {
    const text = $(sel).text().trim();
    if (text && text.match(/\d/)) {
      console.log(`   ${sel}: ${text.substring(0, 80)}`);
    }
  }

  // Also check meta/breadcrumb
  const countMatch = $('body').text().match(/(\d[\d\.]*)\s*Anzeigen/i);
  if (countMatch) {
    console.log(`   Found total: ${countMatch[1]} listings`);
    structure.totalListings = parseInt(countMatch[1].replace(/\./g, ''));
  }

  // Listing cards
  console.log('\n📦 Looking for listing cards...');
  const selectors = [
    'article.aditem',
    'li[data-adid]',
    '[class*="aditem"]',
    '[data-testid*="listing"]',
    'article'
  ];

  for (const selector of selectors) {
    const elements = $(selector);
    if (elements.length > 3) {
      console.log(`   ✅ Found ${elements.length} listings with: ${selector}`);
      structure.listingCards = elements.length;
      structure.listingSelector = selector;

      const first = elements.first();
      const adid = first.attr('data-adid') || first.find('[data-adid]').attr('data-adid');
      const title = first.find('h2, h3, .text-module-begin').text().trim();
      const price = first.find('.aditem-main--middle--price, [class*="price"]').text().trim();
      const href = first.find('a').attr('href');
      const isTop = first.find('[class*="topad"], [class*="highlight"]').length > 0;

      console.log(`   Sample ad ID: ${adid}`);
      console.log(`   Sample title: ${title.substring(0, 60)}`);
      console.log(`   Sample price: ${price}`);
      console.log(`   Sample href: ${href}`);
      console.log(`   Is top ad: ${isTop}`);

      structure.sampleListing = { adid, title: title.substring(0, 100), price, href, isTop };
      break;
    }
  }

  // Subcategories
  console.log('\n📁 Looking for subcategories...');
  $('a[href*="/s-"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    const parent = $(el).parent().text();
    const countMatch = parent.match(/\((\d+)\)/);

    if (href && text && text.length > 3 && text.length < 50 && countMatch) {
      const entry = {
        name: text,
        url: href.startsWith('http') ? href : BASE_URL + href,
        count: parseInt(countMatch[1])
      };
      if (!structure.subcategories.find(c => c.name === entry.name)) {
        structure.subcategories.push(entry);
        console.log(`   ${text}: ${entry.count} items`);
      }
    }
  });

  // Pagination
  console.log('\n📄 Looking for pagination...');
  const pagLinks = $('[class*="pagination"] a, a[href*="/seite:"]');
  console.log(`   Found ${pagLinks.length} pagination links`);
  pagLinks.slice(0, 5).each((i, el) => {
    console.log(`   [${i}] ${$(el).text().trim()} → ${$(el).attr('href')}`);
  });

  if (pagLinks.length > 0) {
    structure.pagination = { found: true, type: 'path-based (/seite:N/)', example: pagLinks.first().attr('href') };
  }

  // TOP ads
  const topAds = $('[class*="topad"], [class*="highlight"], .aditem-highlight').length;
  console.log(`\n⭐ TOP/Highlight ads: ${topAds}`);
  structure.topAdsOnPage = topAds;

  findings.structure.categoryPage = structure;
  findings.categories = structure.subcategories;
}

async function analyzeListingPage() {
  console.log('\n🔍 ANALYZING INDIVIDUAL LISTING PAGE');

  // Get listing URL from category
  const r = await axios.get(CATEGORY_URL, {
    headers: { 'User-Agent': USER_AGENT }, validateStatus: () => true
  });
  const categoryHtml = typeof r.data === 'string' ? r.data : '';

  const $ = cheerio.load(categoryHtml);
  let listingUrl = null;

  $('a[href*="/s-anzeige/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !listingUrl) {
      listingUrl = href.startsWith('http') ? href : BASE_URL + href;
      return false;
    }
  });

  if (!listingUrl) {
    // Try data-adid based URL
    const adId = $('[data-adid]').first().attr('data-adid');
    if (adId) {
      listingUrl = `${BASE_URL}/s-anzeige/${adId}`;
      console.log(`   Constructed URL from ad ID: ${listingUrl}`);
    }
  }

  if (!listingUrl) {
    console.log('   ⚠️  Could not find listing URL');
    findings.issues.push({ test: 'Find listing URL', error: 'No /s-anzeige/ links found' });
    return;
  }

  console.log(`   Listing URL: ${listingUrl}`);
  await sleep(1000);

  const { html, error } = await fetchPage(listingUrl, 'Individual listing');
  if (error) return;

  writeFileSync('discovery/samples/kleinanzeigen-listing.html', html);
  findings.samples.push('kleinanzeigen-listing.html');

  const $l = cheerio.load(html);

  // Extract fields
  const title = $l('h1#viewad-title, h1').first().text().trim();
  const price = $l('#viewad-price, [class*="price--main"]').text().trim();
  const description = $l('#viewad-description-text, [class*="description"]').text().trim();
  const images = $l('#viewad-image, img[src*="img."]').length;
  const location = $l('#viewad-locality, [data-testid="location"]').text().trim();
  const postedDate = $l('#viewad-extra-info [data-testid], .addetailslist--detail').text().trim();
  const sellerName = $l('#viewad-contact-name, [class*="seller"]').text().trim();

  // Check for shipping/negotiable
  const hasShipping = html.includes('Versand');
  const isNegotiable = html.includes('Verhandlungsbasis') || html.includes('VHB');

  console.log(`   Title: ${title.substring(0, 60)}`);
  console.log(`   Price: ${price}`);
  console.log(`   Description: ${description.length} chars`);
  console.log(`   Images: ${images}`);
  console.log(`   Location: ${location}`);
  console.log(`   Has shipping: ${hasShipping}`);
  console.log(`   Negotiable: ${isNegotiable}`);

  findings.structure.listingPage = {
    url: listingUrl,
    fields: {
      title: title.substring(0, 100),
      price,
      descriptionLength: description.length,
      imageCount: images,
      location,
      sellerName,
      hasShipping,
      isNegotiable
    }
  };
}

async function testPagination() {
  console.log('\n🔍 TESTING PAGINATION');

  // Kleinanzeigen uses path-based pagination: /seite:2/
  const page2Url = CATEGORY_URL.replace('/c', '/seite:2/c');
  await sleep(1000);

  const { html, result } = await fetchPage(page2Url, 'Page 2 (path-based)');
  if (result?.ok) {
    const $ = cheerio.load(html);
    const sel = findings.structure.categoryPage?.listingSelector || 'article.aditem';
    const count = $(sel).length;
    console.log(`   Page 2 listings: ${count}`);
    findings.structure.pagination = { works: true, type: 'path-based', page2Url, page2Listings: count };
  }
}

async function testRateLimit() {
  console.log('\n⏱️  TESTING RATE LIMITS');
  const results = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      const r = await axios.get(CATEGORY_URL, { headers: { 'User-Agent': USER_AGENT }, validateStatus: () => true });
      results.push({ status: r.status, time: Date.now() - start });
      console.log(`   Request ${i + 1}: ${r.status} (${Date.now() - start}ms)`);
    } catch (e) {
      results.push({ error: e.message });
    }
    await sleep(300);
  }
  findings.structure.rateLimitTest = {
    results,
    blocked: results.some(r => r.status === 429 || r.status === 403)
  };
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     KLEINANZEIGEN.DE DISCOVERY ANALYSIS    ║');
  console.log('╚════════════════════════════════════════════╝');

  await analyzeHomepage();
  await analyzeCategoryPage();
  await analyzeListingPage();
  await testPagination();
  await testRateLimit();

  const report = `# Kleinanzeigen.de Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues: ${findings.issues.length}
- Sample files: ${findings.samples.length}
- Subcategories found: ${findings.categories.length}

## Connectivity Tests

${findings.tests.map(t => `
### ${t.description}
- Status: ${t.status ?? 'ERROR'} | Time: ${t.responseTime ?? 'N/A'}ms | Size: ${t.contentLength ? (t.contentLength / 1024).toFixed(1) + 'KB' : 'N/A'}
${t.error ? `- Error: ${t.error}` : ''}
`).join('\n')}

## Structure

### Category Page
\`\`\`json
${JSON.stringify(findings.structure.categoryPage, null, 2)}
\`\`\`

### Listing Page
\`\`\`json
${JSON.stringify(findings.structure.listingPage, null, 2)}
\`\`\`

### Pagination
\`\`\`json
${JSON.stringify(findings.structure.pagination, null, 2)}
\`\`\`

### Rate Limiting
\`\`\`json
${JSON.stringify(findings.structure.rateLimitTest, null, 2)}
\`\`\`

## Subcategories

${findings.categories.map(c => `- **${c.name}**: ${c.count?.toLocaleString() ?? '?'} listings — ${c.url}`).join('\n') || '_None found_'}

## Issues

${findings.issues.map(i => `- **${i.test}**: ${i.error}`).join('\n') || '_None_'}

## Full Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

  writeFileSync('discovery/KLEINANZEIGEN-FINDINGS.md', report);
  console.log('\n✅ Report written to discovery/KLEINANZEIGEN-FINDINGS.md');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
