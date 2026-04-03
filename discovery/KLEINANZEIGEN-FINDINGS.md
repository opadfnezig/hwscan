# Kleinanzeigen.de Discovery Report

Generated: 2026-02-26T19:14:19.657Z

## Summary

- Platform: kleinanzeigen.de
- Tests run: 3
- Issues: 1
- Sample files: 1
- Subcategories found: 0

## Connectivity Tests


### Homepage
- Status: 200 | Time: 290ms | Size: 200.5KB



### Computer accessories category
- Status: 200 | Time: 237ms | Size: 268.9KB



### Page 2 (path-based)
- Status: 200 | Time: 217ms | Size: 268.1KB



## Structure

### Category Page
```json
{
  "subcategories": [],
  "listingCards": 27,
  "listingSelector": "article.aditem",
  "pagination": {
    "found": true,
    "type": "path-based (/seite:N/)",
    "example": "/s-multimedia-elektronik/seite:2/c161"
  },
  "sampleListing": {
    "adid": "3151328525",
    "title": "Suche dringend Nintendo 3DS - 2DS - DS Lite - DSi - GameBoy !!!",
    "price": "VB\n                            \n                        \n                    \n                             VB",
    "href": "/s-anzeige/suche-dringend-nintendo-3ds-2ds-ds-lite-dsi-gameboy-/3151328525-279-3489",
    "isTop": false
  },
  "topAdsOnPage": 3
}
```

### Listing Page
```json
undefined
```

### Pagination
```json
{
  "works": true,
  "type": "path-based",
  "page2Url": "https://www.kleinanzeigen.de/s-computer-zubehoer/seite:2/c161+cat_161",
  "page2Listings": 27
}
```

### Rate Limiting
```json
{
  "results": [
    {
      "status": 200,
      "time": 113
    },
    {
      "status": 200,
      "time": 110
    },
    {
      "status": 200,
      "time": 96
    },
    {
      "status": 200,
      "time": 100
    },
    {
      "status": 200,
      "time": 103
    }
  ],
  "blocked": false
}
```

## Subcategories

_None found_

## Issues

- **Find listing URL**: No /s-anzeige/ links found

## Full Data

```json
{
  "platform": "kleinanzeigen.de",
  "timestamp": "2026-02-26T19:14:19.657Z",
  "tests": [
    {
      "description": "Homepage",
      "url": "https://www.kleinanzeigen.de",
      "status": 200,
      "ok": true,
      "responseTime": 290,
      "contentLength": 205363,
      "contentType": "text/html"
    },
    {
      "description": "Computer accessories category",
      "url": "https://www.kleinanzeigen.de/s-computer-zubehoer/c161+cat_161",
      "status": 200,
      "ok": true,
      "responseTime": 237,
      "contentLength": 275353,
      "contentType": "text/html;charset=UTF-8"
    },
    {
      "description": "Page 2 (path-based)",
      "url": "https://www.kleinanzeigen.de/s-computer-zubehoer/seite:2/c161+cat_161",
      "status": 200,
      "ok": true,
      "responseTime": 217,
      "contentLength": 274560,
      "contentType": "text/html;charset=UTF-8"
    }
  ],
  "structure": {
    "homepage": {
      "accessible": true,
      "hasCloudflare": false,
      "hasCaptcha": false
    },
    "categoryPage": {
      "subcategories": [],
      "listingCards": 27,
      "listingSelector": "article.aditem",
      "pagination": {
        "found": true,
        "type": "path-based (/seite:N/)",
        "example": "/s-multimedia-elektronik/seite:2/c161"
      },
      "sampleListing": {
        "adid": "3151328525",
        "title": "Suche dringend Nintendo 3DS - 2DS - DS Lite - DSi - GameBoy !!!",
        "price": "VB\n                            \n                        \n                    \n                             VB",
        "href": "/s-anzeige/suche-dringend-nintendo-3ds-2ds-ds-lite-dsi-gameboy-/3151328525-279-3489",
        "isTop": false
      },
      "topAdsOnPage": 3
    },
    "pagination": {
      "works": true,
      "type": "path-based",
      "page2Url": "https://www.kleinanzeigen.de/s-computer-zubehoer/seite:2/c161+cat_161",
      "page2Listings": 27
    },
    "rateLimitTest": {
      "results": [
        {
          "status": 200,
          "time": 113
        },
        {
          "status": 200,
          "time": 110
        },
        {
          "status": 200,
          "time": 96
        },
        {
          "status": 200,
          "time": 100
        },
        {
          "status": 200,
          "time": 103
        }
      ],
      "blocked": false
    }
  },
  "issues": [
    {
      "test": "Find listing URL",
      "error": "No /s-anzeige/ links found"
    }
  ],
  "samples": [
    "kleinanzeigen-category.html"
  ],
  "categories": []
}
```
