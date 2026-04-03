# Aukro.cz Discovery Report

Generated: 2025-12-14T14:12:36.873Z

## Summary

- Platform: aukro.cz
- Tests run: 3
- Issues found: 0
- Sample files: 1
- **Cloudflare detected**: ✅ YES
- **Protection type**: None

## Cloudflare Status

```json
{
  "detected": true,
  "protectionType": null,
  "workarounds": []
}
```

## Connectivity Tests


### Category page - basic fetch
- URL: https://aukro.cz/pocitace-a-hry
- Status: 200
- Response time: 821ms
- Content size: 2397.2KB
- CF-Ray: 9ade4c13189f269b-PRG
- Server: cloudflare



### Full category page
- URL: https://aukro.cz/pocitace-a-hry
- Status: 200
- Response time: 756ms
- Content size: 2404.5KB
- CF-Ray: 9ade4c1e3b63269b-PRG
- Server: cloudflare



### SOAP API endpoint
- URL: http://api.aukro.cz/
- Status: 200
- Response time: 80ms
- Content size: 0.7KB
- CF-Ray: 9ade4c328d09f971-PRG
- Server: cloudflare



## Structure Analysis


### Category Page (if accessible)
```json
{
  "listingCards": 0,
  "hasAuctions": true,
  "hasFixedPrice": true
}
```


### API

```json
{
  "accessible": true,
  "status": 200,
  "note": "Likely seller-only API, not for public listings"
}
```


## Workarounds Tested



## Issues

No critical issues (protection is expected)

## Sample Files

- `discovery/samples/aukro-category.html`

## Recommendations


### Cloudflare Bypass Strategies

Since Cloudflare protection is active, consider these approaches:

1. **Puppeteer/Playwright with Stealth**
   - Use `puppeteer-extra` with `puppeteer-extra-plugin-stealth`
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


## Full Data

```json
{
  "platform": "aukro.cz",
  "timestamp": "2025-12-14T14:12:36.873Z",
  "tests": [
    {
      "description": "Category page - basic fetch",
      "url": "https://aukro.cz/pocitace-a-hry",
      "status": 200,
      "ok": true,
      "responseTime": 821,
      "contentLength": 2454713,
      "contentType": "text/html; charset=utf-8",
      "server": "cloudflare",
      "cfRay": "9ade4c13189f269b-PRG",
      "setCookie": "INGRESSCOOKIE=f58aaf07b3dd0f45fe7343f970339230|5a3dfb243e0bf4d04d28c9e92c86426c; Expires=Sun, 14-Dec-25 15:12:36 GMT; Max-Age=3600; Path=/; HttpOnly, listing-sorting-criteria=undefined; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, x-aukro-auto-oauth=true; Path=/, x-aukro-auto-oauth=true; Path=/, aukro-token=d9872a18-b3c6-48ab-bddd-28c758aedf48; Path=/; Expires=Mon, 14 Dec 2026 14:12:37 GMT, x-aukro-auto-oauth=true; Path=/, platform-type-user-agent=undefined; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, platform-type-user-agent=%7B%22platformType%22%3A%22WEB%22%2C%22userAgent%22%3A%22Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F120.0.0.0%20Safari%2F537.36%22%7D; Path=/, x-aukro-auto-oauth=true; Path=/, listing-sorting-criteria=undefined; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    },
    {
      "description": "Full category page",
      "url": "https://aukro.cz/pocitace-a-hry",
      "status": 200,
      "ok": true,
      "responseTime": 756,
      "contentLength": 2462170,
      "contentType": "text/html; charset=utf-8",
      "server": "cloudflare",
      "cfRay": "9ade4c1e3b63269b-PRG",
      "setCookie": "INGRESSCOOKIE=38c8f084bf6e754447711c633872ccf9|5a3dfb243e0bf4d04d28c9e92c86426c; Expires=Sun, 14-Dec-25 15:12:38 GMT; Max-Age=3600; Path=/; HttpOnly, listing-sorting-criteria=undefined; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, x-aukro-auto-oauth=true; Path=/, x-aukro-auto-oauth=true; Path=/, aukro-token=17dd5449-8c55-4bbe-947a-9e68883b800d; Path=/; Expires=Mon, 14 Dec 2026 14:12:38 GMT, x-aukro-auto-oauth=true; Path=/, platform-type-user-agent=undefined; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT, platform-type-user-agent=%7B%22platformType%22%3A%22WEB%22%2C%22userAgent%22%3A%22Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64)%20AppleWebKit%2F537.36%20(KHTML%2C%20like%20Gecko)%20Chrome%2F120.0.0.0%20Safari%2F537.36%22%7D; Path=/, x-aukro-auto-oauth=true; Path=/, listing-sorting-criteria=undefined; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    },
    {
      "description": "SOAP API endpoint",
      "url": "http://api.aukro.cz/",
      "status": 200,
      "ok": true,
      "responseTime": 80,
      "contentLength": 686,
      "contentType": "text/html",
      "server": "cloudflare",
      "cfRay": "9ade4c328d09f971-PRG",
      "setCookie": null
    }
  ],
  "structure": {
    "basicAccess": {
      "success": true,
      "listingElements": 0
    },
    "categoryPage": {
      "listingCards": 0,
      "hasAuctions": true,
      "hasFixedPrice": true
    },
    "api": {
      "accessible": true,
      "status": 200,
      "note": "Likely seller-only API, not for public listings"
    }
  },
  "issues": [],
  "samples": [
    "aukro-category.html"
  ],
  "cloudflare": {
    "detected": true,
    "protectionType": null,
    "workarounds": []
  }
}
```
