import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { fetch as undiciFetch, Agent } from 'undici';

const BASE_URL = 'https://aukro.cz';
const CATEGORY_URL = `${BASE_URL}/pocitace-a-hry`;

const findings = {
  platform: 'aukro.cz',
  timestamp: new Date().toISOString(),
  tests: [],
  successful: [],
  failed: []
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Cloudscraper
async function testCloudscraper() {
  console.log('\n🔍 TEST 1: Cloudscraper Library');

  try {
    // Try to import cloudscraper (might fail if can't install)
    const cloudscraper = await import('cloudscraper').catch(() => null);

    if (!cloudscraper) {
      console.log('   ⚠️  Cloudscraper not available');
      findings.tests.push({
        method: 'Cloudscraper',
        status: 'skipped',
        reason: 'Library not available'
      });
      return false;
    }

    console.log('   Attempting Cloudflare bypass with cloudscraper...');

    const startTime = Date.now();
    const response = await cloudscraper.default({
      uri: CATEGORY_URL,
      resolveWithFullResponse: true
    });

    const elapsed = Date.now() - startTime;

    console.log(`   ✅ SUCCESS! Status: ${response.statusCode} (${elapsed}ms)`);
    console.log(`   Content length: ${(response.body.length / 1024).toFixed(1)}KB`);

    // Check if we got real content
    const $ = cheerio.load(response.body);
    const listings = $('[class*="listing"], article').length;
    console.log(`   Found ${listings} potential listing elements`);

    if (response.statusCode === 200 && listings > 0) {
      writeFileSync('discovery/samples/aukro-cloudscraper.html', response.body);

      findings.tests.push({
        method: 'Cloudscraper',
        status: 'success',
        statusCode: response.statusCode,
        responseTime: elapsed,
        contentSize: response.body.length,
        listingElements: listings
      });

      findings.successful.push('Cloudscraper');
      return true;
    }

    findings.tests.push({
      method: 'Cloudscraper',
      status: 'partial',
      statusCode: response.statusCode,
      note: 'Got response but no listings found'
    });

    return false;

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    findings.tests.push({
      method: 'Cloudscraper',
      status: 'failed',
      error: error.message
    });
    findings.failed.push('Cloudscraper');
    return false;
  }
}

// Test 2: Axios with full browser headers
async function testAxiosFullHeaders() {
  console.log('\n🔍 TEST 2: Axios with Full Browser Headers');

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Connection': 'keep-alive'
    };

    console.log('   Making request with comprehensive browser headers...');

    const startTime = Date.now();
    const response = await axios.get(CATEGORY_URL, {
      headers,
      maxRedirects: 5,
      validateStatus: () => true // Accept any status
    });

    const elapsed = Date.now() - startTime;

    console.log(`   Status: ${response.status} (${elapsed}ms)`);
    console.log(`   Content length: ${(response.data.length / 1024).toFixed(1)}KB`);

    const $ = cheerio.load(response.data);
    const listings = $('[class*="listing"], article').length;
    console.log(`   Found ${listings} potential listing elements`);

    if (response.status === 200 && listings > 0) {
      console.log('   ✅ SUCCESS!');
      writeFileSync('discovery/samples/aukro-axios.html', response.data);

      findings.tests.push({
        method: 'Axios Full Headers',
        status: 'success',
        statusCode: response.status,
        responseTime: elapsed,
        contentSize: response.data.length,
        listingElements: listings
      });

      findings.successful.push('Axios Full Headers');
      return true;
    } else {
      console.log('   ❌ Failed - No listings found or non-200 status');

      findings.tests.push({
        method: 'Axios Full Headers',
        status: 'failed',
        statusCode: response.status,
        listingElements: listings
      });

      findings.failed.push('Axios Full Headers');
      return false;
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    findings.tests.push({
      method: 'Axios Full Headers',
      status: 'failed',
      error: error.message
    });
    findings.failed.push('Axios Full Headers');
    return false;
  }
}

// Test 3: Got with cookie jar
async function testGotWithCookies() {
  console.log('\n🔍 TEST 3: Got with Cookie Jar');

  try {
    const got = await import('got');
    const { CookieJar } = await import('tough-cookie');

    const cookieJar = new CookieJar();

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };

    console.log('   Step 1: Visit homepage to get cookies...');

    const homepageResponse = await got.default(BASE_URL, {
      headers,
      cookieJar,
      followRedirect: true,
      throwHttpErrors: false
    });

    console.log(`   Homepage: ${homepageResponse.statusCode}`);

    // Wait a bit
    await sleep(2000);

    console.log('   Step 2: Visit category with cookies...');

    const startTime = Date.now();
    const response = await got.default(CATEGORY_URL, {
      headers: {
        ...headers,
        'Referer': BASE_URL
      },
      cookieJar,
      followRedirect: true,
      throwHttpErrors: false
    });

    const elapsed = Date.now() - startTime;

    console.log(`   Status: ${response.statusCode} (${elapsed}ms)`);
    console.log(`   Content length: ${(response.body.length / 1024).toFixed(1)}KB`);

    const $ = cheerio.load(response.body);
    const listings = $('[class*="listing"], article').length;
    console.log(`   Found ${listings} potential listing elements`);

    if (response.statusCode === 200 && listings > 0) {
      console.log('   ✅ SUCCESS!');
      writeFileSync('discovery/samples/aukro-got.html', response.body);

      findings.tests.push({
        method: 'Got with Cookie Jar',
        status: 'success',
        statusCode: response.statusCode,
        responseTime: elapsed,
        contentSize: response.body.length,
        listingElements: listings
      });

      findings.successful.push('Got with Cookie Jar');
      return true;
    } else {
      console.log('   ❌ Failed - No listings found or non-200 status');

      findings.tests.push({
        method: 'Got with Cookie Jar',
        status: 'failed',
        statusCode: response.statusCode,
        listingElements: listings
      });

      findings.failed.push('Got with Cookie Jar');
      return false;
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    findings.tests.push({
      method: 'Got with Cookie Jar',
      status: 'failed',
      error: error.message
    });
    findings.failed.push('Got with Cookie Jar');
    return false;
  }
}

// Test 4: Undici (modern HTTP/1.1 client)
async function testUndici() {
  console.log('\n🔍 TEST 4: Undici HTTP Client');

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    console.log('   Making request with Undici...');

    const startTime = Date.now();
    const response = await undiciFetch(CATEGORY_URL, { headers });
    const body = await response.text();
    const elapsed = Date.now() - startTime;

    console.log(`   Status: ${response.status} (${elapsed}ms)`);
    console.log(`   Content length: ${(body.length / 1024).toFixed(1)}KB`);

    const $ = cheerio.load(body);
    const listings = $('[class*="listing"], article').length;
    console.log(`   Found ${listings} potential listing elements`);

    if (response.status === 200 && listings > 0) {
      console.log('   ✅ SUCCESS!');
      writeFileSync('discovery/samples/aukro-undici.html', body);

      findings.tests.push({
        method: 'Undici',
        status: 'success',
        statusCode: response.status,
        responseTime: elapsed,
        contentSize: body.length,
        listingElements: listings
      });

      findings.successful.push('Undici');
      return true;
    } else {
      console.log('   ❌ Failed - No listings found or non-200 status');

      findings.tests.push({
        method: 'Undici',
        status: 'failed',
        statusCode: response.status,
        listingElements: listings
      });

      findings.failed.push('Undici');
      return false;
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    findings.tests.push({
      method: 'Undici',
      status: 'failed',
      error: error.message
    });
    findings.failed.push('Undici');
    return false;
  }
}

// Test 5: Axios with referrer chain
async function testAxiosReferrerChain() {
  console.log('\n🔍 TEST 5: Axios with Referrer Chain Simulation');

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    console.log('   Step 1: Visit homepage...');
    const homepage = await axios.get(BASE_URL, {
      headers,
      validateStatus: () => true
    });

    console.log(`   Homepage: ${homepage.status}`);
    await sleep(1500);

    console.log('   Step 2: Visit category list...');
    const categoryList = await axios.get(`${BASE_URL}/kategorie`, {
      headers: {
        ...headers,
        'Referer': BASE_URL
      },
      validateStatus: () => true
    });

    console.log(`   Category list: ${categoryList.status}`);
    await sleep(1500);

    console.log('   Step 3: Visit target category...');
    const startTime = Date.now();
    const response = await axios.get(CATEGORY_URL, {
      headers: {
        ...headers,
        'Referer': `${BASE_URL}/kategorie`
      },
      validateStatus: () => true
    });

    const elapsed = Date.now() - startTime;

    console.log(`   Status: ${response.status} (${elapsed}ms)`);
    console.log(`   Content length: ${(response.data.length / 1024).toFixed(1)}KB`);

    const $ = cheerio.load(response.data);
    const listings = $('[class*="listing"], article').length;
    console.log(`   Found ${listings} potential listing elements`);

    if (response.status === 200 && listings > 0) {
      console.log('   ✅ SUCCESS!');
      writeFileSync('discovery/samples/aukro-referrer-chain.html', response.data);

      findings.tests.push({
        method: 'Axios Referrer Chain',
        status: 'success',
        statusCode: response.status,
        responseTime: elapsed,
        contentSize: response.data.length,
        listingElements: listings
      });

      findings.successful.push('Axios Referrer Chain');
      return true;
    } else {
      console.log('   ❌ Failed - No listings found or non-200 status');

      findings.tests.push({
        method: 'Axios Referrer Chain',
        status: 'failed',
        statusCode: response.status,
        listingElements: listings
      });

      findings.failed.push('Axios Referrer Chain');
      return false;
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    findings.tests.push({
      method: 'Axios Referrer Chain',
      status: 'failed',
      error: error.message
    });
    findings.failed.push('Axios Referrer Chain');
    return false;
  }
}

// Test 6: Try mobile user agent
async function testMobileUserAgent() {
  console.log('\n🔍 TEST 6: Mobile User Agent');

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    };

    console.log('   Making request with mobile user agent...');

    const startTime = Date.now();
    const response = await axios.get(CATEGORY_URL, {
      headers,
      validateStatus: () => true
    });

    const elapsed = Date.now() - startTime;

    console.log(`   Status: ${response.status} (${elapsed}ms)`);
    console.log(`   Content length: ${(response.data.length / 1024).toFixed(1)}KB`);

    const $ = cheerio.load(response.data);
    const listings = $('[class*="listing"], article, [class*="item"]').length;
    console.log(`   Found ${listings} potential listing elements`);

    if (response.status === 200 && listings > 0) {
      console.log('   ✅ SUCCESS!');
      writeFileSync('discovery/samples/aukro-mobile.html', response.data);

      findings.tests.push({
        method: 'Mobile User Agent',
        status: 'success',
        statusCode: response.status,
        responseTime: elapsed,
        contentSize: response.data.length,
        listingElements: listings
      });

      findings.successful.push('Mobile User Agent');
      return true;
    } else {
      console.log('   ❌ Failed - No listings found or non-200 status');

      findings.tests.push({
        method: 'Mobile User Agent',
        status: 'failed',
        statusCode: response.status,
        listingElements: listings
      });

      findings.failed.push('Mobile User Agent');
      return false;
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    findings.tests.push({
      method: 'Mobile User Agent',
      status: 'failed',
      error: error.message
    });
    findings.failed.push('Mobile User Agent');
    return false;
  }
}

async function run() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     AUKRO.CZ ADVANCED BYPASS TESTING                       ║');
  console.log('║     (Testing Various Libraries & Techniques)               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const tests = [
    { name: 'Cloudscraper', fn: testCloudscraper },
    { name: 'Axios Full Headers', fn: testAxiosFullHeaders },
    { name: 'Got with Cookies', fn: testGotWithCookies },
    { name: 'Undici', fn: testUndici },
    { name: 'Axios Referrer Chain', fn: testAxiosReferrerChain },
    { name: 'Mobile User Agent', fn: testMobileUserAgent }
  ];

  let successFound = false;

  for (const test of tests) {
    try {
      const success = await test.fn();
      if (success && !successFound) {
        successFound = true;
        console.log(`\n🎉 SUCCESS! ${test.name} works!`);
        console.log('   You can stop here or continue testing other methods...\n');
        // Don't break - test all methods to see what works
      }
    } catch (error) {
      console.error(`\n❌ Test ${test.name} threw error:`, error.message);
    }

    // Wait between tests to avoid triggering rate limits
    await sleep(2000);
  }

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  findings.tests.forEach(test => {
    const icon = test.status === 'success' ? '✅' : test.status === 'skipped' ? '⏭️ ' : '❌';
    console.log(`${icon} ${test.method.padEnd(30)} - ${test.status.toUpperCase()}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
    if (test.listingElements !== undefined) {
      console.log(`   Listing elements found: ${test.listingElements}`);
    }
  });

  console.log('');
  console.log(`Successful methods: ${findings.successful.length}`);
  console.log(`Failed methods: ${findings.failed.length}`);
  console.log('');

  if (findings.successful.length > 0) {
    console.log('✅ BREAKTHROUGH! These methods work:');
    findings.successful.forEach(method => console.log(`   - ${method}`));
    console.log('');
    console.log('💡 Recommendation: Use the first successful method for production scraper');
  } else {
    console.log('❌ No methods succeeded');
    console.log('');
    console.log('Next steps:');
    console.log('   1. Try Puppeteer/Playwright (heavier but more reliable)');
    console.log('   2. Consider commercial solutions (ScrapingBee, BrightData)');
    console.log('   3. Investigate Aukro mobile app API');
  }

  // Write detailed findings
  const report = `# Aukro.cz Advanced Bypass Testing

Generated: ${findings.timestamp}

## Summary

- Tests run: ${findings.tests.length}
- Successful: ${findings.successful.length}
- Failed: ${findings.failed.length}

## Successful Methods

${findings.successful.length > 0 ? findings.successful.map(m => `- ✅ **${m}**`).join('\n') : '_None_'}

## Failed Methods

${findings.failed.length > 0 ? findings.failed.map(m => `- ❌ **${m}**`).join('\n') : '_None_'}

## Detailed Results

${findings.tests.map(test => `
### ${test.method}

- **Status**: ${test.status}
${test.statusCode ? `- **HTTP Status**: ${test.statusCode}` : ''}
${test.responseTime ? `- **Response Time**: ${test.responseTime}ms` : ''}
${test.contentSize ? `- **Content Size**: ${(test.contentSize / 1024).toFixed(1)}KB` : ''}
${test.listingElements !== undefined ? `- **Listing Elements**: ${test.listingElements}` : ''}
${test.error ? `- **Error**: ${test.error}` : ''}
${test.reason ? `- **Reason**: ${test.reason}` : ''}
${test.note ? `- **Note**: ${test.note}` : ''}
`).join('\n')}

## Recommendations

${findings.successful.length > 0 ? `
### ✅ Use These Methods

${findings.successful.map((method, i) => `
${i + 1}. **${method}**
   - Proven to bypass Cloudflare
   - Ready for production use
   - See code in \`discovery/aukro-advanced.js\`
`).join('\n')}

### Implementation Example

\`\`\`javascript
// Based on successful method: ${findings.successful[0]}
// See full implementation in discovery/aukro-advanced.js
// Copy the working function to your production scraper
\`\`\`
` : `
### ❌ No Simple Bypass Found

All tested methods failed to bypass Cloudflare protection.

**Next Steps:**

1. **Puppeteer/Playwright** (if dependencies can be installed)
   - Uses real browser to solve challenges
   - More reliable but resource-intensive
   - Requires Chrome/Chromium installation

2. **Commercial Solutions**
   - ScrapingBee: $49-99/month
   - BrightData: Enterprise pricing
   - ScraperAPI: $49+/month
   - Handles Cloudflare updates automatically

3. **Mobile App API**
   - Check if Aukro has Android/iOS app
   - Reverse engineer API endpoints
   - May have weaker protection

4. **Defer to Later Stage**
   - Focus on Bazos, Tori, OLX (all working)
   - Add Aukro when budget allows commercial solution
`}

## Full Test Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

  writeFileSync('discovery/AUKRO-ADVANCED-FINDINGS.md', report);
  console.log('📊 Detailed report: discovery/AUKRO-ADVANCED-FINDINGS.md\n');
}

run();
