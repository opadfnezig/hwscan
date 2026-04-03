import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

// Bazos.sk — Slovak sister site to bazos.cz
// Key difference: uses flexbox layout (div.inzeraty.inzeratyflex) instead of .inzerat
// Same ?hledb=N offset pagination (step 20), same price/title selectors
const BASE_URL = 'https://pc.bazos.sk';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'bazos.sk',
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
        'Accept-Language': 'sk,cs;q=0.8,en;q=0.5',
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

    const icon = result.ok ? '✅' : '❌';
    console.log(`   ${icon} Status: ${response.status} (${elapsed}ms, ${(html.length / 1024).toFixed(1)}KB)`);

    findings.tests.push(result);
    return { html, result };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    findings.tests.push({ description, url, error: error.message, ok: false });
    findings.issues.push({ test: description, error: error.message });
    return { error };
  }
}

async function analyzeMainPage() {
  console.log('\n🔍 ANALYZING MAIN PC CATEGORY PAGE');

  const { html, error } = await fetchPage(BASE_URL + '/', 'Main PC category');
  if (error) return;

  writeFileSync('discovery/samples/bazossk-main.html', html);
  findings.samples.push('bazossk-main.html');

  const $ = cheerio.load(html);
  const structure = { totalListings: null, listingCards: 0, listingSelector: null, pagination: {}, topListings: 0 };

  // Look for total count — bazos uses "Zobrazeno X-Y z TOTAL" or "Inzeráty PC celkem: N"
  console.log('\n📊 Looking for total listings count...');
  const bodyText = $('body').text();

  const countMatch = bodyText.match(/Inzer[áa]ty[^:]*:\s*([\d\s]+)/i)
    || bodyText.match(/z\s+([\d\s]+)/);
  if (countMatch) {
    structure.totalListings = parseInt(countMatch[1].replace(/\s/g, ''));
    console.log(`   Total listings: ${structure.totalListings}`);
  }

  // Look for listing cards — bazos.sk uses div.inzeraty.inzeratyflex (flexbox layout)
  // bazos.cz uses .inzerat (table layout); .sk switched to flex
  console.log('\n📦 Looking for listing cards...');
  const selectors = [
    'div.inzeraty.inzeratyflex',  // confirmed working on bazos.sk
    '.inzeratyflex',
    '.inzerat',                    // bazos.cz selector (fallback)
    '[class*="inzerat"]'
  ];

  for (const selector of selectors) {
    const elements = $(selector);
    if (elements.length > 0) {
      console.log(`   ✅ Found ${elements.length} listings with: ${selector}`);
      structure.listingCards = elements.length;
      structure.listingSelector = selector;

      const first = elements.first();
      // Title: .inzeratynadpis a  (confirmed on bazos.sk)
      const title = first.find('.inzeratynadpis a').text().trim()
        || first.find('.nadpis a, .nadpis').text().trim();
      // Price: .inzeratycena  (confirmed on bazos.sk)
      const price = first.find('.inzeratycena').text().trim()
        || first.find('.cena').text().trim();
      const href = first.find('a[href*="/inzerat/"]').attr('href');
      const img = first.find('img').attr('src');

      console.log(`   Sample title: ${title.substring(0, 60)}`);
      console.log(`   Sample price: ${price}`);
      console.log(`   Sample href: ${href}`);
      console.log(`   Has image: ${!!img}`);

      structure.sampleListing = { title: title.substring(0, 100), price, href, hasImage: !!img };
      break;
    }
  }

  // Subcategories
  console.log('\n📁 Looking for subcategories...');
  $('a[href*="bazos.sk/"]').each((i, elem) => {
    const href = $(elem).attr('href') || '';
    const text = $(elem).text().trim();
    if (text && text.length > 2 && text.length < 40 && (
      href.includes('/graficka/') || href.includes('/hdd/') || href.includes('/procesor/') ||
      href.includes('/motherboard/') || href.includes('/pamet/') || href.includes('/sit/') ||
      href.includes('/case/') || href.includes('/pc/')
    )) {
      if (!structure.subcategories) structure.subcategories = [];
      if (!structure.subcategories.find(c => c.url === href)) {
        structure.subcategories.push({ name: text, url: href });
        console.log(`   ${text} → ${href}`);
      }
    }
  });

  // Pagination
  console.log('\n📄 Looking for pagination...');
  const pagLinks = $('a[href*="?hledb="]');
  console.log(`   Found ${pagLinks.length} pagination links`);
  pagLinks.slice(0, 4).each((i, el) => {
    console.log(`   [${i}] ${$(el).text().trim()} → ${$(el).attr('href')}`);
  });
  if (pagLinks.length > 0) {
    structure.pagination = { type: '?hledb=N (offset, step 20)', example: pagLinks.first().attr('href') };
  }

  // TOP promoted listings
  const topMarkers = $('[class*="top"], .top').filter((i, el) => {
    return $(el).text().trim().toUpperCase() === 'TOP';
  });
  console.log(`\n⭐ TOP promoted listings: ${topMarkers.length}`);
  structure.topListings = topMarkers.length;

  findings.structure.mainPage = structure;
  findings.categories = structure.subcategories || [];
}

async function analyzeSubcategory() {
  console.log('\n🔍 ANALYZING SUBCATEGORY (GPU)');
  await sleep(1000);

  const { html, error } = await fetchPage(BASE_URL + '/graficka/', 'GPU subcategory');
  if (error) return;

  writeFileSync('discovery/samples/bazossk-gpu.html', html);
  findings.samples.push('bazossk-gpu.html');

  const $ = cheerio.load(html);
  const selector = findings.structure.mainPage?.listingSelector || 'div.inzeraty.inzeratyflex';
  const count = $(selector).length;
  console.log(`   Listings found with ${selector}: ${count}`);

  const totalMatch = $('body').text().match(/z\s+([\d\s]+)/);
  if (totalMatch) {
    console.log(`   GPU total: ${parseInt(totalMatch[1].replace(/\s/g, ''))}`);
  }

  findings.structure.subcategory = { url: BASE_URL + '/graficka/', listingCount: count };
}

async function analyzeListingPage() {
  console.log('\n🔍 ANALYZING INDIVIDUAL LISTING PAGE');

  const { html: mainHtml, error: mainErr } = await fetchPage(BASE_URL + '/', 'Main (for listing URL)');
  if (mainErr) return;

  const $ = cheerio.load(mainHtml);
  let listingUrl = null;

  $('a[href*="/inzerat/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !listingUrl) {
      listingUrl = href.startsWith('http') ? href : `https:${href}`;
      return false;
    }
  });

  if (!listingUrl) {
    console.log('   ⚠️  Could not find listing URL');
    findings.issues.push({ test: 'Find listing URL', error: 'No /inzerat/ links found' });
    return;
  }

  console.log(`   Listing URL: ${listingUrl}`);
  await sleep(1000);

  const { html, error } = await fetchPage(listingUrl, 'Individual listing');
  if (error) return;

  writeFileSync('discovery/samples/bazossk-listing.html', html);
  findings.samples.push('bazossk-listing.html');

  const $l = cheerio.load(html);

  const title = $l('h1, .nadpisdetail').first().text().trim();
  const price = $l('.inzeratycena, [class*="cena"]').first().text().trim();
  const description = $l('.popisdetail, [class*="popis"]').first().text().trim();
  const images = $l('img[src*="obrazky"]').length;

  console.log(`   Title: ${title.substring(0, 60)}`);
  console.log(`   Price: ${price}`);
  console.log(`   Description: ${description.length} chars`);
  console.log(`   Images: ${images}`);

  // Check for metadata fields (localita, meno, telefon, vlozene)
  const metaLabels = ['Lokalita', 'Meno', 'Telefón', 'Vložené'];
  for (const label of metaLabels) {
    const text = $l('*').filter((i, el) => $l(el).text().includes(label + ':')).first().text().trim();
    if (text) console.log(`   ${label}: ${text.substring(0, 60)}`);
  }

  findings.structure.listingPage = {
    url: listingUrl,
    fields: { title: title.substring(0, 100), price, descriptionLength: description.length, imageCount: images }
  };
}

async function testPagination() {
  console.log('\n🔍 TESTING PAGINATION');
  await sleep(1000);

  const { html, result } = await fetchPage(BASE_URL + '/?hledb=20', 'Page 2 (offset 20)');
  if (result?.ok) {
    const $ = cheerio.load(html);
    const selector = findings.structure.mainPage?.listingSelector || 'div.inzeraty.inzeratyflex';
    const count = $(selector).length;
    console.log(`   Page 2 listings: ${count}`);
    findings.structure.pagination = { works: true, parameter: 'hledb', step: 20, page2Listings: count };
  }
}

async function testRateLimit() {
  console.log('\n⏱️  TESTING RATE LIMITS');
  const results = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      const r = await fetch(BASE_URL + '/', { headers: { 'User-Agent': USER_AGENT } });
      results.push({ status: r.status, time: Date.now() - start });
      console.log(`   Request ${i + 1}: ${r.status} (${Date.now() - start}ms)`);
    } catch (e) {
      results.push({ error: e.message });
    }
    await sleep(200);
  }
  findings.structure.rateLimitTest = {
    results,
    blocked: results.some(r => r.status === 429 || r.status === 403),
    avgMs: Math.round(results.filter(r => r.time).reduce((a, b) => a + b.time, 0) / results.filter(r => r.time).length)
  };
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     BAZOS.SK DISCOVERY ANALYSIS            ║');
  console.log('╚════════════════════════════════════════════╝');

  await analyzeMainPage();
  await analyzeSubcategory();
  await analyzeListingPage();
  await testPagination();
  await testRateLimit();

  const report = `# Bazos.sk Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues: ${findings.issues.length}
- Sample files: ${findings.samples.length}
- Subcategories found: ${findings.categories.length}

## Key Difference from Bazos.cz

Bazos.sk uses a **flexbox layout** for listing cards instead of the table layout used by bazos.cz.

| Feature | Bazos.cz | Bazos.sk |
|---------|----------|----------|
| Listing selector | \`.inzerat\` | \`div.inzeraty.inzeratyflex\` |
| Title selector | \`.nadpis a\` | \`.inzeratynadpis a\` |
| Price selector | \`.cena\` | \`.inzeratycena\` |
| Pagination | \`?hledb=N\` (step 20) | \`?hledb=N\` (step 20) — identical |
| Currency | CZK | EUR |
| Language | Czech | Slovak |

## Connectivity Tests

${findings.tests.map(t => `
### ${t.description}
- Status: ${t.status ?? 'ERROR'} | Time: ${t.responseTime ?? 'N/A'}ms | Size: ${t.contentLength ? (t.contentLength / 1024).toFixed(1) + 'KB' : 'N/A'}
${t.error ? `- Error: ${t.error}` : ''}`).join('\n')}

## Structure

### Main Page
\`\`\`json
${JSON.stringify(findings.structure.mainPage, null, 2)}
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

${findings.categories.map(c => `- **${c.name}**: ${c.url}`).join('\n') || '_None found_'}

## Issues

${findings.issues.map(i => `- **${i.test}**: ${i.error}`).join('\n') || '_None_'}

## Full Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

  writeFileSync('discovery/BAZOSSK-FINDINGS.md', report);
  console.log('\n✅ Report written to discovery/BAZOSSK-FINDINGS.md');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
