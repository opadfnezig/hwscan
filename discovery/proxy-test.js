import axios from 'axios';
import * as cheerio from 'cheerio';

// Proxies provided — format: user:pass@host:port
// Load from proxies.json or env
import { readFileSync } from 'fs';
const PROXY_LIST = JSON.parse(readFileSync(new URL('./proxies.json', import.meta.url), 'utf8'))
  .slice(0, 5)
  .map(p => ({ host: p.host, port: p.http_port, user: p.user, pass: p.pass }));

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA  = 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const PLATFORMS = [
  {
    name: 'bazos.cz',
    url: 'https://pc.bazos.cz/',
    ua: DESKTOP_UA,
    check: (html) => {
      const $ = cheerio.load(html);
      const listings = $('.inzerat').length;
      return { ok: listings > 0, detail: `${listings} .inzerat cards` };
    }
  },
  {
    name: 'bazos.sk',
    url: 'https://pc.bazos.sk/',
    ua: DESKTOP_UA,
    check: (html) => {
      const $ = cheerio.load(html);
      const listings = $('div.inzeraty').length;
      return { ok: listings > 0, detail: `${listings} .inzeraty divs` };
    }
  },
  {
    name: 'tori.fi',
    url: 'https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215',
    ua: DESKTOP_UA,
    check: (html) => {
      const $ = cheerio.load(html);
      const hasNextData = html.includes('__NEXT_DATA__');
      return { ok: hasNextData, detail: `__NEXT_DATA__ present: ${hasNextData}` };
    }
  },
  {
    name: 'olx.ua',
    url: 'https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/',
    ua: DESKTOP_UA,
    check: (html) => {
      const $ = cheerio.load(html);
      const listings = $('[data-cy="l-card"]').length;
      return { ok: listings > 0, detail: `${listings} [data-cy="l-card"]` };
    }
  },
  {
    name: 'olx.pl',
    url: 'https://www.olx.pl/elektronika/komputery/',
    ua: DESKTOP_UA,
    check: (html) => {
      const $ = cheerio.load(html);
      const listings = $('[data-cy="l-card"]').length;
      return { ok: listings > 0, detail: `${listings} [data-cy="l-card"]` };
    }
  },
  {
    name: 'kleinanzeigen.de',
    url: 'https://www.kleinanzeigen.de/s-computer/c228',
    ua: DESKTOP_UA,
    check: (html) => {
      const $ = cheerio.load(html);
      const listings = $('article.aditem').length;
      return { ok: listings > 0, detail: `${listings} article.aditem` };
    }
  },
  // Aukro: test both desktop UA (was 403 without proxy) and mobile UA
  {
    name: 'aukro.cz (desktop UA)',
    url: 'https://aukro.cz/pocitace-a-hry',
    ua: DESKTOP_UA,
    check: (html) => {
      const hasCf = html.toLowerCase().includes('cloudflare') || html.includes('cf-ray');
      const bodyLen = html.length;
      return { ok: !hasCf && bodyLen > 50000, detail: `CF page: ${hasCf}, body: ${(bodyLen/1024).toFixed(1)}KB` };
    }
  },
  {
    name: 'aukro.cz (mobile UA)',
    url: 'https://aukro.cz/pocitace-a-hry',
    ua: MOBILE_UA,
    check: (html) => {
      const hasCf = html.toLowerCase().includes('cloudflare');
      const bodyLen = html.length;
      return { ok: !hasCf && bodyLen > 50000, detail: `CF page: ${hasCf}, body: ${(bodyLen/1024).toFixed(1)}KB` };
    }
  }
];

function pickProxy() {
  return PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testPlatform(platform) {
  const proxy = pickProxy();
  const start = Date.now();

  try {
    const response = await axios.get(platform.url, {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        auth: { username: proxy.user, password: proxy.pass }
      },
      headers: {
        'User-Agent': platform.ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      validateStatus: () => true,
      timeout: 20000
    });

    const elapsed = Date.now() - start;
    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const cfRay = response.headers['cf-ray'];
    const check = platform.check(html);

    return {
      platform: platform.name,
      proxy: `${proxy.host}:${proxy.port}`,
      status: response.status,
      elapsed,
      size: (html.length / 1024).toFixed(1) + 'KB',
      cfRay: cfRay || null,
      dataFound: check.ok,
      detail: check.detail,
      verdict: response.status === 200 && check.ok ? '✅ WORKS' :
               response.status === 200 ? '⚠️  200 but no data' :
               response.status === 403 ? '❌ BLOCKED (403)' :
               `❌ ${response.status}`
    };
  } catch (err) {
    return {
      platform: platform.name,
      proxy: `${proxy.host}:${proxy.port}`,
      status: 'ERROR',
      elapsed: Date.now() - start,
      error: err.message,
      verdict: '❌ ERROR'
    };
  }
}

async function run() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       PROXY TEST — ALL 7 PLATFORMS               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\nUsing ${PROXY_LIST.length} proxies (rotating per request)\n`);

  const results = [];

  for (const platform of PLATFORMS) {
    process.stdout.write(`Testing ${platform.name.padEnd(30)}... `);
    const result = await testPlatform(platform);
    console.log(`${result.verdict}  [${result.status}] ${result.elapsed}ms  ${result.size ?? ''}  ${result.detail ?? result.error ?? ''}`);
    if (result.cfRay) console.log(`${''.padEnd(32)}cf-ray: ${result.cfRay}`);
    results.push(result);
    await sleep(1500); // be respectful between tests
  }

  console.log('\n\n══════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════════════');
  const working = results.filter(r => r.dataFound);
  const partial = results.filter(r => !r.dataFound && r.status === 200);
  const blocked = results.filter(r => !r.dataFound && r.status !== 200);

  console.log(`\n✅ Fully working (data found): ${working.length}`);
  working.forEach(r => console.log(`   - ${r.platform}`));

  if (partial.length) {
    console.log(`\n⚠️  200 OK but no listing data (SPA/challenge): ${partial.length}`);
    partial.forEach(r => console.log(`   - ${r.platform}: ${r.detail}`));
  }

  if (blocked.length) {
    console.log(`\n❌ Blocked or errored: ${blocked.length}`);
    blocked.forEach(r => console.log(`   - ${r.platform}: ${r.status} ${r.error ?? ''}`));
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('Note: Aukro "no data" is expected — it\'s a React SPA.');
  console.log('      The key question is whether desktop UA gets through CF with proxy.');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
