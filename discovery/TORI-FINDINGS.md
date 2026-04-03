# Tori.fi Discovery Report

Generated: 2025-12-14T14:11:57.061Z

## Summary

- Platform: tori.fi
- Tests run: 5
- Issues found: 0
- Sample files: 2

## Connectivity Tests


### Main search page
- URL: https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215
- Status: 200
- Response time: 395ms
- Content size: 1129.4KB



### Individual listing page
- URL: https://www.tori.fi/recommerce/forsale/item/33274253
- Status: 200
- Response time: 95ms
- Content size: 137.5KB



### Pagination test: page parameter
- URL: https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215&page=1
- Status: 200
- Response time: 362ms
- Content size: 1122.4KB



### Pagination test: offset parameter
- URL: https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215&offset=20
- Status: 200
- Response time: 239ms
- Content size: 1122.3KB



### Pagination test: p parameter
- URL: https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215&p=2
- Status: 200
- Response time: 395ms
- Content size: 1122.8KB



## Structure Analysis

### Search Page
{
  "totalListings": null,
  "listingCards": [],
  "pagination": {},
  "ads": {},
  "filters": {},
  "hasStructuredData": true
}

### Listing Page
{
  "url": "https://www.tori.fi/recommerce/forsale/item/33274253",
  "hasNextData": false,
  "fields": {}
}

### Rate Limiting
{
  "requests": 5,
  "results": [
    {
      "status": 200,
      "time": 224
    },
    {
      "status": 200,
      "time": 295
    },
    {
      "status": 200,
      "time": 289
    },
    {
      "status": 200,
      "time": 425
    },
    {
      "status": 200,
      "time": 338
    }
  ],
  "blocked": false
}

## Issues

No issues found

## Sample Files

- `discovery/samples/tori-search.html`
- `discovery/samples/tori-listing.html`

## Full Data

```json
{
  "platform": "tori.fi",
  "timestamp": "2025-12-14T14:11:57.061Z",
  "tests": [
    {
      "description": "Main search page",
      "url": "https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215",
      "status": 200,
      "ok": true,
      "responseTime": 395,
      "contentLength": 1156513,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Individual listing page",
      "url": "https://www.tori.fi/recommerce/forsale/item/33274253",
      "status": 200,
      "ok": true,
      "responseTime": 95,
      "contentLength": 140760,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Pagination test: page parameter",
      "url": "https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215&page=1",
      "status": 200,
      "ok": true,
      "responseTime": 362,
      "contentLength": 1149385,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Pagination test: offset parameter",
      "url": "https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215&offset=20",
      "status": 200,
      "ok": true,
      "responseTime": 239,
      "contentLength": 1149201,
      "contentType": "text/html; charset=utf-8"
    },
    {
      "description": "Pagination test: p parameter",
      "url": "https://www.tori.fi/recommerce/forsale/search?sub_category=1.93.3215&p=2",
      "status": 200,
      "ok": true,
      "responseTime": 395,
      "contentLength": 1149728,
      "contentType": "text/html; charset=utf-8"
    }
  ],
  "structure": {
    "searchPage": {
      "totalListings": null,
      "listingCards": [],
      "pagination": {},
      "ads": {},
      "filters": {},
      "hasStructuredData": true
    },
    "listingPage": {
      "url": "https://www.tori.fi/recommerce/forsale/item/33274253",
      "hasNextData": false,
      "fields": {}
    },
    "rateLimitTest": {
      "requests": 5,
      "results": [
        {
          "status": 200,
          "time": 224
        },
        {
          "status": 200,
          "time": 295
        },
        {
          "status": 200,
          "time": 289
        },
        {
          "status": 200,
          "time": 425
        },
        {
          "status": 200,
          "time": 338
        }
      ],
      "blocked": false
    }
  },
  "issues": [],
  "samples": [
    "tori-search.html",
    "tori-listing.html"
  ]
}
```
