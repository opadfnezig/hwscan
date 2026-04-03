import fetch from 'node-fetch';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.olx.pl';
const CATEGORY_URL = `${BASE_URL}/elektronika/komputery/`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'olx.pl',
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
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
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
    if (result.cfRay) console.log(`   ⚠️  Cloudflare detected (cf-ray: ${result.cfRay})`);

    findings.tests.push(result);
    return { html, result };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    findings.tests.push({ description, url, error: error.message, ok: false });
    findings.issues.push({ test: description, error: error.message });
    return { error };
  }
}

async function analyzeCategoryPage() {
  console.log('\n🔍 ANALYZING CATEGORY PAGE');

  const { html, error } = await fetchPage(CATEGORY_URL, 'Computers category');
  if (error) return;

  writeFileSync('discovery/samples/olxpl-category.html', html);
  findings.samples.push('olxpl-category.html');

  const $ = cheerio.load(html);
  const structure = { subcategories: [], listingCards: 0, listingSelector: null, pagination: {} };

  // OLX.pl is same platform as OLX.ua - check for same data-cy selectors
  console.log('\n📦 Looking for listing cards...');
  const selectors = [
    '[data-cy="l-card"]',
    '[data-testid*="listing"]',
    'div[data-id]',
    'article'
  ];

  for (const selector of selectors) {
    const elements = $(selector);
    if (elements.length > 5) {
      console.log(`   ✅ Found ${elements.length} listings with: ${selector}`);
      structure.listingCards = elements.length;
      structure.listingSelector = selector;

      const first = elements.first();
      const title = first.find('h6, h4, [data-cy="ad-card-title"]').text().trim();
      const price = first.find('[data-testid="ad-price"], [class*="price"]').text().trim();
      const href = first.find('a').attr('href');

      console.log(`   Sample title: ${title.substring(0, 60)}`);
      console.log(`   Sample price: ${price}`);
      console.log(`   Sample href: ${href}`);

      structure.sampleListing = {
        title: title.substring(0, 100),
        price,
        href
      };
      break;
    }
  }

  // Look for subcategories
  console.log('\n📁 Looking for subcategories...');
  $('a[href*="/komputery/"]').each((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();
    if (href && text && text.length > 3) {
      // Find any count nearby
      const countMatch = $(elem).parent().text().match(/\(?([\d\s]+)\)?/);
      const entry = {
        name: text,
        url: href.startsWith('http') ? href : BASE_URL + href,
        count: countMatch ? parseInt(countMatch[1].replace(/\s/g, '')) : null
      };
      if (!structure.subcategories.find(c => c.url === entry.url) && entry.count) {
        structure.subcategories.push(entry);
        console.log(`   ${text}: ${entry.count ?? '?'} items`);
      }
    }
  });

  // Pagination
  console.log('\n📄 Looking for pagination...');
  const paginationEl = $('[data-cy="pagination"], [data-testid="pagination"], a[href*="?page="]');
  console.log(`   Found ${paginationEl.length} pagination elements`);
  paginationEl.slice(0, 4).each((i, el) => {
    console.log(`   [${i}] ${$(el).text().trim()} → ${$(el).attr('href')}`);
  });
  if (paginationEl.length > 0) {
    structure.pagination = { found: true, example: paginationEl.first().attr('href') };
  }

  // Check for 25-page limit (common OLX constraint)
  const bodyText = $('body').text();
  const pgMatch = bodyText.match(/Strona\s+\d+\s+z\s+(\d+)/i);
  if (pgMatch) {
    structure.pagination.totalPages = parseInt(pgMatch[1]);
    console.log(`   Total pages mentioned: ${pgMatch[1]}`);
  }

  // TOP promoted listings
  const topCount = $('*').filter((i, el) => $(el).text() === 'TOP' || $(el).text() === 'Promowane').length;
  console.log(`\n⭐ Promoted listing markers: ${topCount}`);
  structure.promotedCount = topCount;

  findings.structure.categoryPage = structure;
  findings.categories = structure.subcategories;
}

async function analyzeListingPage() {
  console.log('\n🔍 ANALYZING INDIVIDUAL LISTING PAGE');

  const categoryHtml = await axios.get(CATEGORY_URL, {
    headers: { 'User-Agent': USER_AGENT }, validateStatus: () => true
  }).then(r => typeof r.data === 'string' ? r.data : '');

  const $ = cheerio.load(categoryHtml);
  let listingUrl = null;

  $('a[href*="/oferta/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !listingUrl) {
      listingUrl = href.startsWith('http') ? href : BASE_URL + href;
      return false;
    }
  });

  if (!listingUrl) {
    console.log('   ⚠️  Could not find listing URL');
    findings.issues.push({ test: 'Find listing URL', error: 'No /oferta/ links in category page' });
    return;
  }

  console.log(`   Listing URL: ${listingUrl}`);
  await sleep(1000);

  const { html, error } = await fetchPage(listingUrl, 'Individual listing');
  if (error) return;

  writeFileSync('discovery/samples/olxpl-listing.html', html);
  findings.samples.push('olxpl-listing.html');

  const $l = cheerio.load(html);
  const title = $l('h1').first().text().trim();
  const price = $l('[data-testid="ad-price-container"]').text().trim();
  const description = $l('[data-cy="ad_description"]').text().trim();
  const images = $l('img[src*="olx"]').length;
  const condition = $l('*').filter((i, el) => {
    const t = $l(el).text().trim();
    return t === 'Nowe' || t === 'Używane';
  }).first().text();

  console.log(`   Title: ${title.substring(0, 60)}`);
  console.log(`   Price: ${price}`);
  console.log(`   Description: ${description.length} chars`);
  console.log(`   Images: ${images}`);
  console.log(`   Condition: ${condition}`);

  findings.structure.listingPage = {
    url: listingUrl,
    fields: { title: title.substring(0, 100), price, descriptionLength: description.length, imageCount: images, condition }
  };
}

async function testPagination() {
  console.log('\n🔍 TESTING PAGINATION');
  await sleep(1000);
  const { html, result } = await fetchPage(CATEGORY_URL + '?page=2', 'Page 2');
  if (result?.ok) {
    const $ = cheerio.load(html);
    const selector = findings.structure.categoryPage?.listingSelector || '[data-cy="l-card"]';
    const count = $(selector).length;
    console.log(`   Page 2 listings: ${count}`);
    findings.structure.pagination = { works: true, parameter: 'page', page2Listings: count };
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
    await sleep(200);
  }
  findings.structure.rateLimitTest = {
    results,
    blocked: results.some(r => r.status === 429 || r.status === 403)
  };
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     OLX.PL DISCOVERY ANALYSIS              ║');
  console.log('╚════════════════════════════════════════════╝');

  await analyzeCategoryPage();
  await analyzeListingPage();
  await testPagination();
  await testRateLimit();

  const report = `# OLX.pl Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues: ${findings.issues.length}
- Sample files: ${findings.samples.length}

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

  writeFileSync('discovery/OLXPL-FINDINGS.md', report);
  console.log('\n✅ Report written to discovery/OLXPL-FINDINGS.md');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
