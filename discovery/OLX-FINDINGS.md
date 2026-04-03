# OLX.ua Discovery Report

Generated: 2025-12-14T14:12:11.816Z

## Summary

- Platform: olx.ua
- Tests run: 4
- Issues found: 0
- Sample files: 3
- Subcategories discovered: 0

## Connectivity Tests


### Main computers category
- URL: https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/
- Status: 200
- Response time: 995ms
- Content size: 3294.3KB



### Desktop computers subcategory
- URL: https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/nastilni-kompyutery/
- Status: 404
- Response time: 374ms
- Content size: 158.5KB



### Individual listing
- URL: https://www.olx.ua/d/uk/obyavlenie/protsesori-intel-core-IDQYDyI.html
- Status: 200
- Response time: 562ms
- Content size: 1577.2KB



### Page 2
- URL: https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/?page=2
- Status: 200
- Response time: 868ms
- Content size: 3359.2KB



## Structure Analysis

### Category Page
```json
{
  "subcategories": [],
  "listingCards": 52,
  "topListings": 0,
  "pagination": {
    "found": true,
    "example": "/uk/elektronika/kompyutery-i-komplektuyuschie/",
    "hasLimit": true,
    "limitPages": 25
  },
  "listingSelector": "[data-cy=\"l-card\"]",
  "sampleListing": {
    "title": ".css-1sv1kgy{-webkit-box-orient:vertical;display:-webkit-box;-webkit-line-clamp:2;margin-bottom:auto",
    "price": "850 грн..css-1hm1942{color:#7F9799;font-weight:100;width:100%;text-align:right;}.css-15radwo{font-size:var(\n        --fontSizeBodyExtraSmall,\n        12px\n    );line-height:var(\n        --lineHeightRegular,\n        16px\n    );color:#7F9799;font-weight:100;width:100%;text-align:right;}.css-1ygi0zw{color:var(\n        --colorsForegroundPrimary,\n        #02282C\n    );font-family:var(--fontFamilyPrimary, Geomanist, sans-serif);font-weight:700;-webkit-text-decoration:none;text-decoration:none;font-size:var(\n        --fontSizeBodyExtraSmall,\n        12px\n    );line-height:var(\n        --lineHeightRegular,\n        16px\n    );color:#7F9799;font-weight:100;width:100%;text-align:right;}Договірна"
  }
}
```

### Subcategory
```json
{
  "url": "https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/nastilni-kompyutery/",
  "listingCount": 0
}
```

### Listing Page
```json
{
  "url": "https://www.olx.ua/d/uk/obyavlenie/protsesori-intel-core-IDQYDyI.html",
  "fields": {
    "title": "Повідомлення",
    "price": ".css-19feqhn{font-size:var(\n        --fontSizeHeadlineLarge,\n        24px\n    );line-height:var(\n        --lineHeightNarrow,\n        26px\n    );margin:0 0 3px;}.css-yauxmy{color:var(\n        --colorsForegroundPrimary,\n        #02282C\n    );font-family:var(--fontFamilyPrimary, Geomanist, sans-serif);font-weight:700;-webkit-text-decoration:none;text-decoration:none;font-size:var(\n        --fontSizeHeadlineLarge,\n        24px\n    );line-height:var(\n        --lineHeightNarrow,\n        26px\n    );margin:0 0 3px;}110 грн.",
    "descriptionLength": 1318,
    "imageCount": 4
  }
}
```

### Pagination
```json
{
  "works": true,
  "parameter": "page",
  "page2Listings": 52
}
```

### Rate Limiting
```json
{
  "requests": 5,
  "results": [
    {
      "status": 200,
      "time": 1642
    },
    {
      "status": 200,
      "time": 899
    },
    {
      "status": 200,
      "time": 849
    },
    {
      "status": 200,
      "time": 867
    },
    {
      "status": 200,
      "time": 929
    }
  ],
  "blocked": false,
  "averageTime": 1037.2
}
```

## Subcategories Found



## Issues

No issues found

## Sample Files

- `discovery/samples/olx-category.html`
- `discovery/samples/olx-desktops.html`
- `discovery/samples/olx-listing.html`

## Important Notes

⚠️ **25-page limit detected** - This is a known OLX limitation. Accept as "all available data".

## Recommendations

1. **Pagination**: Use `page` parameter
2. **Listing selector**: `[data-cy="l-card"]`
3. **Rate limiting**: No immediate rate limiting - but use 1 req/sec to be safe
4. **Categories to scrape**: Focus on hardware subcategories (desktops, components, servers, network equipment)
5. **Page limit**: Max 25 pages per category - plan scraping strategy accordingly

## Full Data

```json
{
  "platform": "olx.ua",
  "timestamp": "2025-12-14T14:12:11.816Z",
  "tests": [
    {
      "description": "Main computers category",
      "url": "https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/",
      "status": 200,
      "ok": true,
      "responseTime": 995,
      "contentLength": 3373316,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Desktop computers subcategory",
      "url": "https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/nastilni-kompyutery/",
      "status": 404,
      "ok": false,
      "responseTime": 374,
      "contentLength": 162299,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Individual listing",
      "url": "https://www.olx.ua/d/uk/obyavlenie/protsesori-intel-core-IDQYDyI.html",
      "status": 200,
      "ok": true,
      "responseTime": 562,
      "contentLength": 1615007,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Page 2",
      "url": "https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/?page=2",
      "status": 200,
      "ok": true,
      "responseTime": 868,
      "contentLength": 3439773,
      "contentType": "text/html; charset=utf-8"
    }
  ],
  "structure": {
    "categoryPage": {
      "subcategories": [],
      "listingCards": 52,
      "topListings": 0,
      "pagination": {
        "found": true,
        "example": "/uk/elektronika/kompyutery-i-komplektuyuschie/",
        "hasLimit": true,
        "limitPages": 25
      },
      "listingSelector": "[data-cy=\"l-card\"]",
      "sampleListing": {
        "title": ".css-1sv1kgy{-webkit-box-orient:vertical;display:-webkit-box;-webkit-line-clamp:2;margin-bottom:auto",
        "price": "850 грн..css-1hm1942{color:#7F9799;font-weight:100;width:100%;text-align:right;}.css-15radwo{font-size:var(\n        --fontSizeBodyExtraSmall,\n        12px\n    );line-height:var(\n        --lineHeightRegular,\n        16px\n    );color:#7F9799;font-weight:100;width:100%;text-align:right;}.css-1ygi0zw{color:var(\n        --colorsForegroundPrimary,\n        #02282C\n    );font-family:var(--fontFamilyPrimary, Geomanist, sans-serif);font-weight:700;-webkit-text-decoration:none;text-decoration:none;font-size:var(\n        --fontSizeBodyExtraSmall,\n        12px\n    );line-height:var(\n        --lineHeightRegular,\n        16px\n    );color:#7F9799;font-weight:100;width:100%;text-align:right;}Договірна"
      }
    },
    "subcategory": {
      "url": "https://www.olx.ua/uk/elektronika/kompyutery-i-komplektuyuschie/nastilni-kompyutery/",
      "listingCount": 0
    },
    "listingPage": {
      "url": "https://www.olx.ua/d/uk/obyavlenie/protsesori-intel-core-IDQYDyI.html",
      "fields": {
        "title": "Повідомлення",
        "price": ".css-19feqhn{font-size:var(\n        --fontSizeHeadlineLarge,\n        24px\n    );line-height:var(\n        --lineHeightNarrow,\n        26px\n    );margin:0 0 3px;}.css-yauxmy{color:var(\n        --colorsForegroundPrimary,\n        #02282C\n    );font-family:var(--fontFamilyPrimary, Geomanist, sans-serif);font-weight:700;-webkit-text-decoration:none;text-decoration:none;font-size:var(\n        --fontSizeHeadlineLarge,\n        24px\n    );line-height:var(\n        --lineHeightNarrow,\n        26px\n    );margin:0 0 3px;}110 грн.",
        "descriptionLength": 1318,
        "imageCount": 4
      }
    },
    "pagination": {
      "works": true,
      "parameter": "page",
      "page2Listings": 52
    },
    "rateLimitTest": {
      "requests": 5,
      "results": [
        {
          "status": 200,
          "time": 1642
        },
        {
          "status": 200,
          "time": 899
        },
        {
          "status": 200,
          "time": 849
        },
        {
          "status": 200,
          "time": 867
        },
        {
          "status": 200,
          "time": 929
        }
      ],
      "blocked": false,
      "averageTime": 1037.2
    }
  },
  "issues": [],
  "samples": [
    "olx-category.html",
    "olx-desktops.html",
    "olx-listing.html"
  ],
  "categories": []
}
```
