import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://aukro.cz';
const CATEGORY_URL = `${BASE_URL}/pocitace-a-hry`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const findings = {
  platform: 'aukro.cz',
  timestamp: new Date().toISOString(),
  tests: [],
  structure: {},
  issues: [],
  samples: [],
  cloudflare: {
    detected: false,
    protectionType: null,
    workarounds: []
  }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url, description, options = {}) {
  console.log(`\n📡 Fetching: ${description}`);
  console.log(`   URL: ${url}`);

  const startTime = Date.now();
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      ...options.headers
    };

    const response = await fetch(url, { headers });

    const elapsed = Date.now() - startTime;
    const html = await response.text();

    const result = {
      description,
      url,
      status: response.status,
      ok: response.ok,
      responseTime: elapsed,
      contentLength: html.length,
      contentType: response.headers.get('content-type'),
      server: response.headers.get('server'),
      cfRay: response.headers.get('cf-ray'),
      setCookie: response.headers.get('set-cookie')
    };

    // Check for Cloudflare
    if (result.cfRay || result.server?.toLowerCase().includes('cloudflare')) {
      findings.cloudflare.detected = true;
      console.log(`   ⚠️  Cloudflare detected (cf-ray: ${result.cfRay})`);
    }

    // Check response
    if (response.status === 403) {
      console.log(`   ❌ 403 Forbidden - Likely Cloudflare protection`);
      findings.cloudflare.protectionType = '403 Forbidden';

      // Check if it's a Cloudflare challenge page
      if (html.includes('Checking your browser') || html.includes('cloudflare') || html.includes('captcha')) {
        console.log(`   🛡️  Cloudflare challenge page detected`);
        findings.cloudflare.protectionType = 'Browser challenge';
      }
    } else {
      console.log(`   ✅ Status: ${response.status} (${elapsed}ms, ${(html.length / 1024).toFixed(1)}KB)`);
    }

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

async function testBasicAccess() {
  console.log('\n🔍 TESTING BASIC ACCESS');

  const { html, result, error } = await fetchPage(CATEGORY_URL, 'Category page - basic fetch');

  if (error) return false;

  if (result.status === 403) {
    writeFileSync('discovery/samples/aukro-403.html', html);
    findings.samples.push('aukro-403.html');
    return false;
  }

  if (result.ok) {
    writeFileSync('discovery/samples/aukro-category.html', html);
    findings.samples.push('aukro-category.html');

    const $ = cheerio.load(html);

    // Quick structure check
    const listings = $('[class*="listing"], [data-id], article').length;
    console.log(`   Found ${listings} potential listing elements`);

    findings.structure.basicAccess = {
      success: true,
      listingElements: listings
    };

    return true;
  }

  return false;
}

async function testWithDifferentHeaders() {
  console.log('\n🔍 TESTING WITH DIFFERENT HEADERS');

  const headerVariations = [
    {
      name: 'Chrome Desktop',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      }
    },
    {
      name: 'Firefox Desktop',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
      }
    },
    {
      name: 'Mobile Chrome',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36'
      }
    }
  ];

  for (const variation of headerVariations) {
    await sleep(1000);
    const { result } = await fetchPage(
      CATEGORY_URL,
      `Headers test: ${variation.name}`,
      { headers: variation.headers }
    );

    findings.cloudflare.workarounds.push({
      method: `Headers: ${variation.name}`,
      success: result?.ok || false,
      status: result?.status
    });
  }
}

async function testHomepageAccess() {
  console.log('\n🔍 TESTING HOMEPAGE ACCESS');

  await sleep(1000);
  const { result } = await fetchPage(BASE_URL, 'Homepage');

  if (result?.ok) {
    console.log('   ✅ Homepage accessible - category might have stricter rules');
    findings.cloudflare.workarounds.push({
      method: 'Homepage access',
      success: true,
      note: 'Homepage accessible but category blocked'
    });
  }
}

async function testAPIEndpoint() {
  console.log('\n🔍 TESTING API ENDPOINT');

  const apiUrl = 'http://api.aukro.cz/';
  await sleep(1000);

  const { result } = await fetchPage(apiUrl, 'SOAP API endpoint');

  if (result) {
    findings.structure.api = {
      accessible: result.ok,
      status: result.status,
      note: 'Likely seller-only API, not for public listings'
    };
  }
}

async function checkAlternativeURLs() {
  console.log('\n🔍 CHECKING ALTERNATIVE URLs');

  const urls = [
    { url: `${BASE_URL}/listing`, desc: 'Alternative listing path' },
    { url: `${BASE_URL}/search`, desc: 'Search endpoint' },
    { url: `${BASE_URL}/kategorie`, desc: 'Categories page' }
  ];

  for (const { url, desc } of urls) {
    await sleep(1000);
    const { result } = await fetchPage(url, desc);

    if (result?.ok) {
      console.log(`   ✅ ${desc} accessible!`);
      findings.cloudflare.workarounds.push({
        method: `Alternative URL: ${url}`,
        success: true
      });
    }
  }
}

async function analyzeChallengeResponse() {
  console.log('\n🔍 ANALYZING CLOUDFLARE CHALLENGE');

  // Try to get the challenge page
  const { html } = await fetchPage(CATEGORY_URL, 'Challenge analysis');

  if (html) {
    const $ = cheerio.load(html);

    // Look for Cloudflare indicators
    const indicators = {
      hasCloudflareChallenge: html.includes('Checking your browser') || html.includes('Just a moment'),
      hasTurnstile: html.includes('turnstile') || html.includes('cf-challenge'),
      hasCaptcha: html.includes('captcha'),
      hasJSChallenge: html.includes('jschl') || html.includes('challenge-form'),
      title: $('title').text(),
      bodyText: $('body').text().substring(0, 200)
    };

    console.log('   Challenge indicators:');
    console.log(`      Has "Checking browser": ${indicators.hasCloudflareChallenge}`);
    console.log(`      Has Turnstile: ${indicators.hasTurnstile}`);
    console.log(`      Has CAPTCHA: ${indicators.hasCaptcha}`);
    console.log(`      Has JS Challenge: ${indicators.hasJSChallenge}`);
    console.log(`      Page title: ${indicators.title}`);

    findings.cloudflare.challengeDetails = indicators;
  }
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     AUKRO.CZ DISCOVERY ANALYSIS            ║');
  console.log('║     (Cloudflare Protection Testing)        ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    const basicAccessWorks = await testBasicAccess();

    if (!basicAccessWorks) {
      console.log('\n⚠️  Basic access blocked - testing workarounds...');
      await testWithDifferentHeaders();
      await testHomepageAccess();
      await checkAlternativeURLs();
      await analyzeChallengeResponse();
    } else {
      console.log('\n✅ Basic access works! Running full analysis...');
      // If basic access works, we can analyze structure
      const { html } = await fetchPage(CATEGORY_URL, 'Full category page');
      const $ = cheerio.load(html);

      const structure = {
        listingCards: $('[class*="listing"]').length,
        hasAuctions: $('*').filter((i, el) => $(el).text().includes('Aukce')).length > 0,
        hasFixedPrice: $('*').filter((i, el) => $(el).text().includes('Kup teď')).length > 0
      };

      findings.structure.categoryPage = structure;
    }

    await testAPIEndpoint();

    // Write findings
    const report = `# Aukro.cz Discovery Report

Generated: ${findings.timestamp}

## Summary

- Platform: ${findings.platform}
- Tests run: ${findings.tests.length}
- Issues found: ${findings.issues.length}
- Sample files: ${findings.samples.length}
- **Cloudflare detected**: ${findings.cloudflare.detected ? '✅ YES' : '❌ NO'}
- **Protection type**: ${findings.cloudflare.protectionType || 'None'}

## Cloudflare Status

\`\`\`json
${JSON.stringify(findings.cloudflare, null, 2)}
\`\`\`

## Connectivity Tests

${findings.tests.map(t => `
### ${t.description}
- URL: ${t.url}
- Status: ${t.status || 'ERROR'}
- Response time: ${t.responseTime || 'N/A'}ms
- Content size: ${t.contentLength ? (t.contentLength / 1024).toFixed(1) + 'KB' : 'N/A'}
- CF-Ray: ${t.cfRay || 'None'}
- Server: ${t.server || 'Unknown'}
${t.error ? `- Error: ${t.error}` : ''}
`).join('\n')}

## Structure Analysis

${findings.structure.categoryPage ? `
### Category Page (if accessible)
\`\`\`json
${JSON.stringify(findings.structure.categoryPage, null, 2)}
\`\`\`
` : '⚠️ Category page not accessible - structure analysis skipped'}

### API
${findings.structure.api ? `
\`\`\`json
${JSON.stringify(findings.structure.api, null, 2)}
\`\`\`
` : 'Not tested'}

## Workarounds Tested

${findings.cloudflare.workarounds.map(w => `
- **${w.method}**: ${w.success ? '✅ Success' : '❌ Failed'} ${w.status ? `(${w.status})` : ''}
  ${w.note ? `  _${w.note}_` : ''}
`).join('\n')}

## Issues

${findings.issues.length > 0 ? findings.issues.map(i => `- **${i.test}**: ${i.error}`).join('\n') : 'No critical issues (protection is expected)'}

## Sample Files

${findings.samples.map(s => `- \`discovery/samples/${s}\``).join('\n')}

## Recommendations

${findings.cloudflare.detected ? `
### Cloudflare Bypass Strategies

Since Cloudflare protection is active, consider these approaches:

1. **Puppeteer/Playwright with Stealth**
   - Use \`puppeteer-extra\` with \`puppeteer-extra-plugin-stealth\`
   - Let real browser solve challenges
   - Extract data from rendered page

2. **Commercial Solutions**
   - ScrapingBee (Cloudflare bypass built-in)
   - BrightData (Unblocker service)
   - ScraperAPI
   - Cost: ~$49-99/month for basic plans

3. **Residential Proxies**
   - Rotate IPs from residential pool
   - Combined with headless browser
   - More complex but cheaper long-term

4. **Manual Cookie Extraction**
   - Open site in real browser
   - Extract cookies after challenge
   - Use cookies in script
   - Requires periodic refresh

5. **Mobile App API**
   - Check if mobile app has weaker protection
   - Reverse engineer app API
   - May be against ToS

### Priority Decision

Given the spec mentions aukro.cz is wanted for "price reference/arbitrage analysis", evaluate:
- Is the data critical enough to justify cost?
- Can we start with other platforms and add aukro later?
- What's the budget for commercial bypass solutions?

**Suggested approach**: Start with other platforms (bazos, tori, olx) which work fine. Add aukro.cz in Stage 2/3 if arbitrage feature shows it's valuable.
` : `
### No Protection Detected

Great news! Direct fetching works. Proceed with standard scraping approach:
- Use 1 req/sec rate limiting
- Rotate User-Agent headers
- Monitor for any future protection additions
`}

## Full Data

\`\`\`json
${JSON.stringify(findings, null, 2)}
\`\`\`
`;

    writeFileSync('discovery/AUKRO-FINDINGS.md', report);
    console.log('\n✅ Report written to discovery/AUKRO-FINDINGS.md');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    findings.issues.push({ test: 'Main execution', error: error.message });
  }
}

run();
