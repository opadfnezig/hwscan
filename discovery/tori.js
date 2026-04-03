import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.tori.fi';
const SEARCH_URL = `${BASE_URL}/recommerce/forsale/search?sub_category=1.93.3215`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'tori.fi',
  timestamp: new Date().toISOString(),
  tests: [],
  structure: {},
  issues: [],
  samples: []
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
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
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

async function analyzeSearchPage() {
  console.log('\n🔍 ANALYZING SEARCH PAGE');

  const { html, error } = await fetchPage(SEARCH_URL, 'Main search page');
  if (error) return;

  // Save sample
  writeFileSync('discovery/samples/tori-search.html', html);
  findings.samples.push('tori-search.html');

  const $ = cheerio.load(html);

  // Analyze structure
  const structure = {
    totalListings: null,
    listingCards: [],
    pagination: {},
    ads: {},
    filters: {}
  };

  // Look for listing cards
  console.log('\n📦 Looking for listing cards...');

  // Try different possible selectors
  const possibleSelectors = [
    'article',
    '[data-testid*="listing"]',
    '[class*="listing"]',
    '[class*="item-card"]',
    '[class*="ad-card"]',
    '.item',
    '[data-id]'
  ];

  for (const selector of possibleSelectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      console.log(`   Found ${elements.length} elements with selector: ${selector}`);

      // Analyze first few elements
      elements.slice(0, 3).each((i, elem) => {
        const $elem = $(elem);
        const classes = $elem.attr('class') || '';
        const dataAttrs = Object.keys($elem.attr() || {}).filter(k => k.startsWith('data-'));
        console.log(`      [${i}] classes: ${classes.substring(0, 100)}`);
        console.log(`          data-*: ${dataAttrs.join(', ')}`);
      });
    }
  }

  // Look for JSON-LD or structured data
  console.log('\n🔍 Looking for structured data...');
  $('script[type="application/ld+json"]').each((i, elem) => {
    try {
      const jsonData = JSON.parse($(elem).html());
      console.log(`   Found JSON-LD type: ${jsonData['@type']}`);
      structure.hasStructuredData = true;
    } catch (e) {}
  });

  // Look for Next.js data
  const nextData = $('#__NEXT_DATA__').html();
  if (nextData) {
    try {
      const data = JSON.parse(nextData);
      console.log('   ✅ Found __NEXT_DATA__ (Next.js app)');
      writeFileSync('discovery/samples/tori-next-data.json', JSON.stringify(data, null, 2));
      findings.samples.push('tori-next-data.json');

      // Navigate the data structure
      if (data.props?.pageProps) {
        console.log('      Page props keys:', Object.keys(data.props.pageProps));
        structure.nextData = {
          hasPageProps: true,
          keys: Object.keys(data.props.pageProps)
        };
      }
    } catch (e) {
      console.log('   ⚠️  Found __NEXT_DATA__ but failed to parse');
    }
  }

  // Check pagination
  console.log('\n📄 Looking for pagination...');
  const paginationSelectors = [
    '[class*="pagination"]',
    '[aria-label*="pagination"]',
    'nav a[href*="page"]',
    'a[href*="offset"]',
    'button[aria-label*="next"]'
  ];

  for (const selector of paginationSelectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      console.log(`   Found ${elements.length} pagination elements: ${selector}`);
      elements.slice(0, 5).each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        console.log(`      [${i}] ${text || 'no text'} -> ${href || 'no href'}`);
      });
    }
  }

  findings.structure.searchPage = structure;
}

async function analyzeListingPage() {
  console.log('\n🔍 ANALYZING LISTING DETAIL PAGE');

  // First, we need to extract a real listing ID from the search page
  console.log('   Reading search page to find a listing...');

  const searchHtml = await fetch(SEARCH_URL, {
    headers: { 'User-Agent': USER_AGENT }
  }).then(r => r.text());

  const $ = cheerio.load(searchHtml);

  // Try to find listing URLs
  let listingUrl = null;

  // Look for links containing /item/ or /forsale/
  $('a[href*="/item/"], a[href*="/forsale/"]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && href.includes('/item/') && !listingUrl) {
      listingUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      console.log(`   Found listing URL: ${listingUrl}`);
      return false; // break
    }
  });

  // Also check __NEXT_DATA__
  if (!listingUrl) {
    const nextData = $('#__NEXT_DATA__').html();
    if (nextData) {
      try {
        const data = JSON.parse(nextData);
        const searchText = JSON.stringify(data);
        const itemMatch = searchText.match(/"item_id":"(\d+)"/);
        if (itemMatch) {
          listingUrl = `${BASE_URL}/recommerce/forsale/item/${itemMatch[1]}`;
          console.log(`   Found listing ID in __NEXT_DATA__: ${itemMatch[1]}`);
        }
      } catch (e) {}
    }
  }

  if (!listingUrl) {
    console.log('   ⚠️  Could not find any listing URLs');
    findings.issues.push({ test: 'Find listing URL', error: 'No listing URLs found in search page' });
    return;
  }

  await sleep(1000); // Rate limit

  const { html, error } = await fetchPage(listingUrl, 'Individual listing page');
  if (error) return;

  writeFileSync('discovery/samples/tori-listing.html', html);
  findings.samples.push('tori-listing.html');

  const $listing = cheerio.load(html);

  const listingStructure = {
    url: listingUrl,
    hasNextData: false,
    fields: {}
  };

  // Check for __NEXT_DATA__
  const nextData = $listing('#__NEXT_DATA__').html();
  if (nextData) {
    try {
      const data = JSON.parse(nextData);
      console.log('   ✅ Listing has __NEXT_DATA__');
      writeFileSync('discovery/samples/tori-listing-next-data.json', JSON.stringify(data, null, 2));
      findings.samples.push('tori-listing-next-data.json');
      listingStructure.hasNextData = true;

      // Try to extract listing data
      if (data.props?.pageProps) {
        const props = data.props.pageProps;
        console.log('      Page props keys:', Object.keys(props));

        // Look for listing data
        if (props.item || props.listing || props.ad) {
          const item = props.item || props.listing || props.ad;
          console.log('      Found item data with keys:', Object.keys(item));
          listingStructure.fields = {
            id: item.id || item.item_id,
            title: item.title || item.subject,
            price: item.price || item.ad_details?.price,
            location: item.location,
            images: item.images?.length || 0,
            description: item.body?.substring(0, 100)
          };
        }
      }
    } catch (e) {
      console.log('   ⚠️  Failed to parse __NEXT_DATA__:', e.message);
    }
  }

  findings.structure.listingPage = listingStructure;
}

async function testPagination() {
  console.log('\n🔍 TESTING PAGINATION');

  // Test different pagination approaches
  const paginationTests = [
    { url: `${SEARCH_URL}&page=1`, desc: 'page parameter' },
    { url: `${SEARCH_URL}&offset=20`, desc: 'offset parameter' },
    { url: `${SEARCH_URL}&p=2`, desc: 'p parameter' }
  ];

  for (const test of paginationTests) {
    await sleep(1000);
    const { html, result } = await fetchPage(test.url, `Pagination test: ${test.desc}`);

    if (result?.ok) {
      // Check if content is different from page 1
      const $ = cheerio.load(html);
      const nextData = $('#__NEXT_DATA__').html();

      if (nextData) {
        try {
          const data = JSON.parse(nextData);
          const searchText = JSON.stringify(data);
          console.log(`      Content check: ${searchText.length} chars, contains offset: ${searchText.includes('offset')}`);
        } catch (e) {}
      }
    }
  }
}

async function testRateLimit() {
  console.log('\n⏱️  TESTING RATE LIMITS');

  const testUrl = SEARCH_URL;
  const requests = 5;

  console.log(`   Making ${requests} rapid requests...`);

  const results = [];
  for (let i = 0; i < requests; i++) {
    const start = Date.now();
    try {
      const response = await fetch(testUrl, {
        headers: { 'User-Agent': USER_AGENT }
      });
      const elapsed = Date.now() - start;
      results.push({ status: response.status, time: elapsed });
      console.log(`      Request ${i + 1}: ${response.status} (${elapsed}ms)`);
    } catch (error) {
      results.push({ error: error.message });
      console.log(`      Request ${i + 1}: ERROR - ${error.message}`);
    }

    // Small delay
    await sleep(200);
  }

  findings.structure.rateLimitTest = {
    requests,
    results,
    blocked: results.some(r => r.status === 429 || r.status === 403)
  };
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     TORI.FI DISCOVERY ANALYSIS             ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await analyzeSearchPage();
    await analyzeListingPage();
    await testPagination();
    await testRateLimit();

    // Write findings
    const report = `# Tori.fi Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues found: ${findings.issues.length}
- Sample files: ${findings.samples.length}

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

### Search Page
${JSON.stringify(findings.structure.searchPage, null, 2)}

### Listing Page
${JSON.stringify(findings.structure.listingPage, null, 2)}

### Rate Limiting
${JSON.stringify(findings.structure.rateLimitTest, null, 2)}

## Issues

${findings.issues.length > 0 ? findings.issues.map(i => `- **${i.test}**: ${i.error}`).join('\n') : 'No issues found'}

## Sample Files

${findings.samples.map(s => `- \`discovery/samples/${s}\``).join('\n')}

## Full Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

    writeFileSync('discovery/TORI-FINDINGS.md', report);
    console.log('\n✅ Report written to discovery/TORI-FINDINGS.md');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    findings.issues.push({ test: 'Main execution', error: error.message });
  }
}

run();
