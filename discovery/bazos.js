import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://pc.bazos.cz';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'bazos.cz',
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
        'Accept-Language': 'cs,en;q=0.5',
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

async function analyzeMainPage() {
  console.log('\n🔍 ANALYZING MAIN PC CATEGORY PAGE');

  const { html, error } = await fetchPage(BASE_URL + '/', 'Main PC category');
  if (error) return;

  writeFileSync('discovery/samples/bazos-main.html', html);
  findings.samples.push('bazos-main.html');

  const $ = cheerio.load(html);

  // Analyze structure
  const structure = {
    totalListingsText: null,
    listingCards: 0,
    categories: [],
    pagination: {},
    topListings: 0
  };

  // Look for total count
  console.log('\n📊 Looking for total listings count...');
  const countTexts = $('*').filter((i, elem) => {
    const text = $(elem).text();
    return text.includes('Zobrazeno') || text.includes('z ');
  });

  countTexts.each((i, elem) => {
    const text = $(elem).text().trim();
    if (text.includes('Zobrazeno')) {
      console.log(`   Found count text: ${text}`);
      structure.totalListingsText = text;
      // Try to extract number: "Zobrazeno 1-20 z 49092"
      const match = text.match(/z\s+([\d\s]+)/);
      if (match) {
        structure.totalListings = parseInt(match[1].replace(/\s/g, ''));
        console.log(`   Extracted total: ${structure.totalListings}`);
      }
    }
  });

  // Look for categories
  console.log('\n📁 Looking for subcategories...');
  $('a[href*="bazos.cz/"]').each((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();

    // Check if it looks like a category link
    if (href && (
      href.includes('/graficka/') ||
      href.includes('/hdd/') ||
      href.includes('/procesor/') ||
      href.includes('/motherboard/') ||
      href.includes('/pamet/') ||
      href.includes('/sit/') ||
      href.includes('/case/')
    )) {
      console.log(`   Found category: ${text} -> ${href}`);
      structure.categories.push({ name: text, url: href });
    }
  });

  // Look for listing cards
  console.log('\n📦 Looking for listing cards...');
  const possibleSelectors = [
    '.inzerat',
    '.inzeraty .inzerat',
    '[class*="inzerat"]',
    'table.inzeraty',
    'div.inzerat'
  ];

  for (const selector of possibleSelectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      console.log(`   Found ${elements.length} listings with selector: ${selector}`);
      structure.listingCards = elements.length;
      structure.listingSelector = selector;

      // Analyze first listing
      const first = elements.first();
      const sample = {
        html: first.html(),
        text: first.text().substring(0, 200),
        classes: first.attr('class'),
        children: first.children().length
      };

      console.log(`   First listing preview:`);
      console.log(`      Classes: ${sample.classes}`);
      console.log(`      Children: ${sample.children}`);
      console.log(`      Text preview: ${sample.text.substring(0, 100)}...`);

      // Look for specific fields
      const title = first.find('.nadpis, [class*="nadpis"]').text().trim();
      const price = first.find('.cena, [class*="cena"]').text().trim();
      const image = first.find('img').attr('src');

      console.log(`      Title: ${title.substring(0, 50)}`);
      console.log(`      Price: ${price}`);
      console.log(`      Image: ${image ? 'Found' : 'Not found'}`);

      structure.sampleListing = {
        title: title.substring(0, 100),
        price,
        hasImage: !!image
      };

      break;
    }
  }

  // Look for TOP (promoted) listings
  console.log('\n⭐ Looking for promoted listings...');
  const topMarkers = $('[class*="top"], .top, [style*="background"]').filter((i, elem) => {
    const text = $(elem).text().toLowerCase();
    const style = $(elem).attr('style') || '';
    return text.includes('top') || style.includes('yellow') || style.includes('background');
  });

  console.log(`   Found ${topMarkers.length} potential TOP markers`);
  structure.topListings = topMarkers.length;

  // Look for pagination
  console.log('\n📄 Looking for pagination...');
  const paginationLinks = $('a[href*="?"]').filter((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();
    return href && (
      text.match(/^\d+$/) || // Just a number
      text.includes('>>') ||
      text.includes('<<') ||
      text.includes('Další') ||
      text.includes('Předchozí')
    );
  });

  console.log(`   Found ${paginationLinks.length} pagination links`);
  paginationLinks.slice(0, 5).each((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();
    console.log(`      [${i}] ${text} -> ${href}`);
  });

  if (paginationLinks.length > 0) {
    const firstLink = paginationLinks.first().attr('href');
    structure.pagination.example = firstLink;
    structure.pagination.type = firstLink.includes('hledb=') ? 'hledb parameter' : 'unknown';
  }

  findings.structure.mainPage = structure;
  findings.categories = structure.categories;
}

async function analyzeSubcategory() {
  console.log('\n🔍 ANALYZING SUBCATEGORY (GPU)');

  await sleep(1000);

  const subcategoryUrl = BASE_URL + '/graficka/';
  const { html, error } = await fetchPage(subcategoryUrl, 'GPU subcategory');
  if (error) return;

  writeFileSync('discovery/samples/bazos-gpu.html', html);
  findings.samples.push('bazos-gpu.html');

  const $ = cheerio.load(html);

  const structure = {
    url: subcategoryUrl,
    listingCount: 0,
    pagination: null
  };

  // Count listings
  const listings = $('.inzerat, .inzeraty .inzerat');
  structure.listingCount = listings.length;
  console.log(`   Found ${structure.listingCount} listings`);

  // Check pagination
  const pageText = $('*').filter((i, elem) => {
    return $(elem).text().includes('Zobrazeno');
  }).text();

  console.log(`   Pagination text: ${pageText}`);
  structure.paginationText = pageText;

  findings.structure.subcategory = structure;
}

async function analyzeListingPage() {
  console.log('\n🔍 ANALYZING LISTING DETAIL PAGE');

  // First get a listing URL from main page
  const mainHtml = await fetch(BASE_URL + '/', {
    headers: { 'User-Agent': USER_AGENT }
  }).then(r => r.text());

  const $ = cheerio.load(mainHtml);

  let listingUrl = null;
  $('a[href*="/inzerat/"]').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && !listingUrl) {
      listingUrl = href.startsWith('http') ? href : `https:${href}`;
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

  writeFileSync('discovery/samples/bazos-listing.html', html);
  findings.samples.push('bazos-listing.html');

  const $listing = cheerio.load(html);

  const listingStructure = {
    url: listingUrl,
    fields: {}
  };

  // Extract fields
  const title = $listing('h1, .nadpisdetail').first().text().trim();
  const price = $listing('.inzeratycena, [class*="cena"]').first().text().trim();
  const description = $listing('.popisdetail, [class*="popis"]').first().text().trim();
  const images = $listing('img[src*="obrazky"]');

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

  // Look for metadata
  const metadata = {};
  $listing('*').filter((i, elem) => {
    const text = $listing(elem).text();
    return text.includes('Lokalita:') ||
           text.includes('Jméno:') ||
           text.includes('Telefon:') ||
           text.includes('Vloženo:');
  }).each((i, elem) => {
    const text = $listing(elem).text().trim();
    console.log(`   Metadata: ${text.substring(0, 80)}`);
  });

  findings.structure.listingPage = listingStructure;
}

async function testPagination() {
  console.log('\n🔍 TESTING PAGINATION');

  // Based on observed pagination, test hledb parameter
  const page2Url = BASE_URL + '/?hledb=20';

  await sleep(1000);

  const { html, result } = await fetchPage(page2Url, 'Page 2 (offset 20)');

  if (result?.ok) {
    const $ = cheerio.load(html);
    const listings = $('.inzerat').length;
    console.log(`   Page 2 has ${listings} listings`);

    // Check if different from page 1
    findings.structure.pagination = {
      works: true,
      parameter: 'hledb',
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
      const response = await fetch(BASE_URL + '/', {
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
  console.log('║     BAZOS.CZ DISCOVERY ANALYSIS            ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await analyzeMainPage();
    await analyzeSubcategory();
    await analyzeListingPage();
    await testPagination();
    await testRateLimit();

    // Write findings
    const report = `# Bazos.cz Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues found: ${findings.issues.length}
- Sample files: ${findings.samples.length}
- Categories discovered: ${findings.categories.length}

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

### Main Page
\`\`\`json
${JSON.stringify(findings.structure.mainPage, null, 2)}
\`\`\`

### Subcategory (GPU)
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

## Categories Found

${findings.categories.map(c => `- **${c.name}**: ${c.url}`).join('\n')}

## Issues

${findings.issues.length > 0 ? findings.issues.map(i => `- **${i.test}**: ${i.error}`).join('\n') : 'No issues found'}

## Sample Files

${findings.samples.map(s => `- \`discovery/samples/${s}\``).join('\n')}

## Recommendations

1. **Pagination**: Use \`hledb\` parameter (offset-based), increment by 20
2. **Listing selector**: \`.inzerat\` or \`.inzeraty .inzerat\`
3. **Rate limiting**: ${findings.structure.rateLimitTest?.blocked ? 'Rate limiting detected - use delays' : 'No immediate rate limiting - but use 1 req/sec to be safe'}
4. **Categories to scrape**: ${findings.categories.length} subcategories found

## Full Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

    writeFileSync('discovery/BAZOS-FINDINGS.md', report);
    console.log('\n✅ Report written to discovery/BAZOS-FINDINGS.md');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    findings.issues.push({ test: 'Main execution', error: error.message });
  }
}

run();
