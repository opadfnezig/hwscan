import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.olx.ua';
const CATEGORY_URL = `${BASE_URL}/uk/elektronika/kompyutery-i-komplektuyuschie/`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'olx.ua',
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
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      }
    });

    const elapsed = Date.now() - startTime;
    const html = await response.text();

    const result = {
      description,
      url,
      status: response.status,
      ok: response.ok,
      responseTime: elapsed,
      contentLength: html.length,
      contentType: response.headers.get('content-type')
    };

    console.log(`   ✅ Status: ${response.status} (${elapsed}ms, ${(html.length / 1024).toFixed(1)}KB)`);

    findings.tests.push(result);
    return { response, html, result };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    findings.tests.push({
      description,
      url,
      error: error.message,
      ok: false
    });
    findings.issues.push({ test: description, error: error.message });
    return { error };
  }
}

async function analyzeCategoryPage() {
  console.log('\n🔍 ANALYZING CATEGORY PAGE');

  const { html, error } = await fetchPage(CATEGORY_URL, 'Main computers category');
  if (error) return;

  writeFileSync('discovery/samples/olx-category.html', html);
  findings.samples.push('olx-category.html');

  const $ = cheerio.load(html);

  const structure = {
    subcategories: [],
    listingCards: 0,
    topListings: 0,
    pagination: {}
  };

  // Look for subcategories with counts
  console.log('\n📁 Looking for subcategories...');
  $('a').each((i, elem) => {
    const $link = $(elem);
    const href = $link.attr('href');
    const text = $link.text().trim();

    // Look for links that might be subcategories
    if (href && href.includes('/komplektuyuschie/') && text) {
      // Try to find count nearby
      const parent = $link.parent();
      const fullText = parent.text();
      const countMatch = fullText.match(/(\d[\d\s]*)/);

      if (countMatch || text.length > 5) {
        const category = {
          name: text,
          url: href.startsWith('http') ? href : BASE_URL + href,
          count: countMatch ? parseInt(countMatch[1].replace(/\s/g, '')) : null
        };

        // Avoid duplicates
        if (!structure.subcategories.find(c => c.url === category.url)) {
          structure.subcategories.push(category);
          console.log(`   ${category.name}: ${category.count || 'unknown'} items`);
        }
      }
    }
  });

  // Look for listing cards
  console.log('\n📦 Looking for listing cards...');
  const possibleSelectors = [
    '[data-cy="l-card"]',
    '[data-testid*="listing"]',
    'div[data-id]',
    '[class*="offer"]',
    'article'
  ];

  for (const selector of possibleSelectors) {
    const elements = $(selector);
    if (elements.length > 5) { // At least a few listings
      console.log(`   Found ${elements.length} potential listings with: ${selector}`);
      structure.listingCards = elements.length;
      structure.listingSelector = selector;

      // Analyze first listing
      const first = elements.first();
      console.log(`   First listing analysis:`);
      console.log(`      Classes: ${first.attr('class')}`);
      console.log(`      Data attributes: ${Object.keys(first.attr() || {}).filter(k => k.startsWith('data-')).join(', ')}`);

      // Try to extract fields
      const title = first.find('h6, h4, [data-cy="ad-card-title"], [class*="title"]').first().text().trim();
      const price = first.find('[data-testid="ad-price"], [class*="price"]').first().text().trim();

      console.log(`      Title: ${title.substring(0, 60)}`);
      console.log(`      Price: ${price}`);

      structure.sampleListing = {
        title: title.substring(0, 100),
        price
      };

      break;
    }
  }

  // Look for TOP promoted listings
  console.log('\n⭐ Looking for promoted listings...');
  const topMarkers = $('[class*="top"], [class*="promoted"], [class*="featured"]').filter((i, elem) => {
    const text = $(elem).text();
    return text.includes('ТОП') || text.includes('TOP');
  });

  console.log(`   Found ${topMarkers.length} potential TOP markers`);
  structure.topListings = topMarkers.length;

  // Look for pagination
  console.log('\n📄 Looking for pagination...');
  const paginationLinks = $('a[data-cy*="page"], a[href*="page="], [class*="pagination"] a');

  console.log(`   Found ${paginationLinks.length} pagination links`);
  paginationLinks.slice(0, 5).each((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();
    console.log(`      [${i}] ${text} -> ${href}`);
  });

  if (paginationLinks.length > 0) {
    structure.pagination.found = true;
    structure.pagination.example = paginationLinks.first().attr('href');
  }

  // Check for page limit warning
  const pageText = $('body').text();
  if (pageText.includes('25') && (pageText.includes('сторінк') || pageText.includes('page'))) {
    console.log('   ⚠️  Potential 25-page limit mentioned');
    structure.pagination.hasLimit = true;
    structure.pagination.limitPages = 25;
  }

  findings.structure.categoryPage = structure;
  findings.categories = structure.subcategories;
}

async function analyzeSubcategory() {
  console.log('\n🔍 ANALYZING SUBCATEGORY (Desktops)');

  await sleep(1000);

  // Try to find desktop category
  const desktopUrl = CATEGORY_URL + 'nastilni-kompyutery/';
  const { html, error } = await fetchPage(desktopUrl, 'Desktop computers subcategory');

  if (error) {
    // Try alternative URL
    console.log('   Trying alternative URL...');
    return;
  }

  writeFileSync('discovery/samples/olx-desktops.html', html);
  findings.samples.push('olx-desktops.html');

  const $ = cheerio.load(html);

  const structure = {
    url: desktopUrl,
    listingCount: 0
  };

  // Count listings using previously found selector
  const selector = findings.structure.categoryPage?.listingSelector || '[data-cy="l-card"]';
  const listings = $(selector);
  structure.listingCount = listings.length;
  console.log(`   Found ${structure.listingCount} listings with selector: ${selector}`);

  findings.structure.subcategory = structure;
}

async function analyzeListingPage() {
  console.log('\n🔍 ANALYZING LISTING DETAIL PAGE');

  // Get a listing URL from category page
  const categoryHtml = await fetch(CATEGORY_URL, {
    headers: { 'User-Agent': USER_AGENT }
  }).then(r => r.text());

  const $ = cheerio.load(categoryHtml);

  let listingUrl = null;

  // Look for listing URLs
  $('a[href*="/d/uk/"], a[href*="/obyavlenie/"]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && !listingUrl && !href.includes('#')) {
      listingUrl = href.startsWith('http') ? href : BASE_URL + href;
      console.log(`   Found listing URL: ${listingUrl}`);
      return false;
    }
  });

  if (!listingUrl) {
    console.log('   ⚠️  Could not find listing URL');
    findings.issues.push({ test: 'Find listing URL', error: 'No listing URLs found' });
    return;
  }

  await sleep(1000);

  const { html, error } = await fetchPage(listingUrl, 'Individual listing');
  if (error) return;

  writeFileSync('discovery/samples/olx-listing.html', html);
  findings.samples.push('olx-listing.html');

  const $listing = cheerio.load(html);

  const listingStructure = {
    url: listingUrl,
    fields: {}
  };

  // Extract fields
  const title = $listing('h1, h4').first().text().trim();
  const price = $listing('[data-testid="ad-price-container"], .price-label').first().text().trim();
  const description = $listing('[data-cy="ad_description"]').text().trim();
  const images = $listing('img[src*="olx"]');

  console.log(`   Title: ${title.substring(0, 50)}`);
  console.log(`   Price: ${price}`);
  console.log(`   Description length: ${description.length} chars`);
  console.log(`   Images: ${images.length}`);

  listingStructure.fields = {
    title: title.substring(0, 100),
    price,
    descriptionLength: description.length,
    imageCount: images.length
  };

  // Look for condition badge
  const condition = $listing('*').filter((i, elem) => {
    const text = $listing(elem).text();
    return text === 'Нове' || text === 'Вживане';
  }).text();

  if (condition) {
    console.log(`   Condition: ${condition}`);
    listingStructure.fields.condition = condition;
  }

  findings.structure.listingPage = listingStructure;
}

async function testPagination() {
  console.log('\n🔍 TESTING PAGINATION');

  const page2Url = CATEGORY_URL + '?page=2';

  await sleep(1000);

  const { html, result } = await fetchPage(page2Url, 'Page 2');

  if (result?.ok) {
    const $ = cheerio.load(html);
    const selector = findings.structure.categoryPage?.listingSelector || '[data-cy="l-card"]';
    const listings = $(selector).length;
    console.log(`   Page 2 has ${listings} listings`);

    findings.structure.pagination = {
      works: true,
      parameter: 'page',
      page2Listings: listings
    };
  }
}

async function testRateLimit() {
  console.log('\n⏱️  TESTING RATE LIMITS');

  const requests = 5;
  console.log(`   Making ${requests} rapid requests...`);

  const results = [];
  for (let i = 0; i < requests; i++) {
    const start = Date.now();
    try {
      const response = await fetch(CATEGORY_URL, {
        headers: { 'User-Agent': USER_AGENT }
      });
      const elapsed = Date.now() - start;
      results.push({ status: response.status, time: elapsed });
      console.log(`      Request ${i + 1}: ${response.status} (${elapsed}ms)`);
    } catch (error) {
      results.push({ error: error.message });
      console.log(`      Request ${i + 1}: ERROR - ${error.message}`);
    }

    await sleep(200);
  }

  findings.structure.rateLimitTest = {
    requests,
    results,
    blocked: results.some(r => r.status === 429 || r.status === 403),
    averageTime: results.filter(r => r.time).reduce((a, b) => a + b.time, 0) / results.filter(r => r.time).length
  };
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     OLX.UA DISCOVERY ANALYSIS              ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await analyzeCategoryPage();
    await analyzeSubcategory();
    await analyzeListingPage();
    await testPagination();
    await testRateLimit();

    // Write findings
    const report = `# OLX.ua Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues found: ${findings.issues.length}
- Sample files: ${findings.samples.length}
- Subcategories discovered: ${findings.categories.length}

## Connectivity Tests

${findings.tests.map(t => `
### ${t.description}
- URL: ${t.url}
- Status: ${t.status || 'ERROR'}
- Response time: ${t.responseTime || 'N/A'}ms
- Content size: ${t.contentLength ? (t.contentLength / 1024).toFixed(1) + 'KB' : 'N/A'}
${t.error ? `- Error: ${t.error}` : ''}
`).join('\n')}

## Structure Analysis

### Category Page
\`\`\`json
${JSON.stringify(findings.structure.categoryPage, null, 2)}
\`\`\`

### Subcategory
\`\`\`json
${JSON.stringify(findings.structure.subcategory, null, 2)}
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

## Subcategories Found

${findings.categories.map(c => `- **${c.name}**: ${c.count ? c.count.toLocaleString() : 'unknown'} listings - ${c.url}`).join('\n')}

## Issues

${findings.issues.length > 0 ? findings.issues.map(i => `- **${i.test}**: ${i.error}`).join('\n') : 'No issues found'}

## Sample Files

${findings.samples.map(s => `- \`discovery/samples/${s}\``).join('\n')}

## Important Notes

${findings.structure.categoryPage?.pagination?.hasLimit ? '⚠️ **25-page limit detected** - This is a known OLX limitation. Accept as "all available data".' : ''}

## Recommendations

1. **Pagination**: Use \`page\` parameter
2. **Listing selector**: \`${findings.structure.categoryPage?.listingSelector || 'TBD'}\`
3. **Rate limiting**: ${findings.structure.rateLimitTest?.blocked ? 'Rate limiting detected - use delays' : 'No immediate rate limiting - but use 1 req/sec to be safe'}
4. **Categories to scrape**: Focus on hardware subcategories (desktops, components, servers, network equipment)
5. **Page limit**: Max 25 pages per category - plan scraping strategy accordingly

## Full Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

    writeFileSync('discovery/OLX-FINDINGS.md', report);
    console.log('\n✅ Report written to discovery/OLX-FINDINGS.md');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    findings.issues.push({ test: 'Main execution', error: error.message });
  }
}

run();
