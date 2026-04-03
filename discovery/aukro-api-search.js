import axios from 'axios';
import { writeFileSync } from 'fs';

console.log('🔍 Searching for Aukro API Endpoints\n');

const findings = {
  timestamp: new Date().toISOString(),
  endpoints: []
};

const mobileHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'cs-CZ,cs;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive'
};

async function testEndpoint(url, description) {
  console.log(`Testing: ${description}`);
  console.log(`  URL: ${url}`);

  try {
    const response = await axios.get(url, {
      headers: mobileHeaders,
      validateStatus: () => true,
      timeout: 10000
    });

    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers['content-type']}`);
    console.log(`  Size: ${JSON.stringify(response.data).length} bytes`);

    if (response.status === 200 && response.headers['content-type']?.includes('json')) {
      console.log('  ✅ Success! Got JSON data\n');

      findings.endpoints.push({
        description,
        url,
        status: response.status,
        contentType: response.headers['content-type'],
        sample: JSON.stringify(response.data).substring(0, 500)
      });

      // Save full response
      const filename = description.replace(/\s+/g, '-').toLowerCase();
      writeFileSync(`discovery/samples/aukro-api-${filename}.json`, JSON.stringify(response.data, null, 2));

      return true;
    } else {
      console.log(`  ❌ Not JSON or failed\n`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}\n`);
    return false;
  }
}

async function run() {
  console.log('Testing potential API endpoints...\n');

  // Common API patterns for auction sites
  const endpoints = [
    { url: 'https://aukro.cz/api/listings', desc: 'Listings API' },
    { url: 'https://aukro.cz/api/search', desc: 'Search API' },
    { url: 'https://aukro.cz/api/items', desc: 'Items API' },
    { url: 'https://aukro.cz/api/v1/listings', desc: 'Listings API v1' },
    { url: 'https://aukro.cz/api/v2/listings', desc: 'Listings API v2' },
    { url: 'https://aukro.cz/api/v1/search', desc: 'Search API v1' },
    { url: 'https://aukro.cz/api/categories/pocitace-a-hry/items', desc: 'Category Items' },
    { url: 'https://api.aukro.cz/listings', desc: 'API subdomain listings' },
    { url: 'https://api.aukro.cz/search', desc: 'API subdomain search' },
    { url: 'https://www.aukro.cz/listing/search?categoryId=4', desc: 'Search with category ID' },
  ];

  let foundAny = false;

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint.url, endpoint.desc);
    if (success) foundAny = true;
    await new Promise(r => setTimeout(r, 1000)); // Wait between requests
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60) + '\n');

  if (findings.endpoints.length > 0) {
    console.log(`✅ Found ${findings.endpoints.length} working API endpoint(s)!\n`);
    findings.endpoints.forEach(ep => {
      console.log(`  - ${ep.description}: ${ep.url}`);
    });
    console.log('\n💡 These APIs can be used instead of scraping HTML!');
  } else {
    console.log('❌ No working API endpoints found with tested URLs\n');
    console.log('Next steps:');
    console.log('  1. Inspect browser Network tab when visiting aukro.cz');
    console.log('  2. Look for XHR/Fetch requests to find actual API endpoints');
    console.log('  3. Mobile UA bypasses Cloudflare - could use Puppeteer to intercept API calls');
  }

  writeFileSync('discovery/AUKRO-API-SEARCH.json', JSON.stringify(findings, null, 2));
  console.log('\n📊 Results saved to discovery/AUKRO-API-SEARCH.json');
}

run();
