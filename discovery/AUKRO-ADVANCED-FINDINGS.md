# Aukro.cz Advanced Bypass Testing

Generated: 2025-12-14T15:26:36.000Z

## Summary

- Tests run: 6
- Successful: 1
- Failed: 4

## Successful Methods

- ✅ **Mobile User Agent**

## Failed Methods

- ❌ **Axios Full Headers**
- ❌ **Got with Cookie Jar**
- ❌ **Undici**
- ❌ **Axios Referrer Chain**

## Detailed Results


### Cloudscraper

- **Status**: partial
- **HTTP Status**: 200





- **Note**: Got response but no listings found


### Axios Full Headers

- **Status**: failed
- **HTTP Status**: 200


- **Listing Elements**: 0





### Got with Cookie Jar

- **Status**: failed
- **HTTP Status**: 200


- **Listing Elements**: 0





### Undici

- **Status**: failed
- **HTTP Status**: 200


- **Listing Elements**: 0





### Axios Referrer Chain

- **Status**: failed
- **HTTP Status**: 200


- **Listing Elements**: 0





### Mobile User Agent

- **Status**: success
- **HTTP Status**: 200
- **Response Time**: 383ms
- **Content Size**: 2218.2KB
- **Listing Elements**: 83





## Recommendations


### ✅ Use These Methods


1. **Mobile User Agent**
   - Proven to bypass Cloudflare
   - Ready for production use
   - See code in `discovery/aukro-advanced.js`


### Implementation Example

```javascript
// Based on successful method: Mobile User Agent
// See full implementation in discovery/aukro-advanced.js
// Copy the working function to your production scraper
```


## Full Test Data

```json
{
  "platform": "aukro.cz",
  "timestamp": "2025-12-14T15:26:36.000Z",
  "tests": [
    {
      "method": "Cloudscraper",
      "status": "partial",
      "statusCode": 200,
      "note": "Got response but no listings found"
    },
    {
      "method": "Axios Full Headers",
      "status": "failed",
      "statusCode": 200,
      "listingElements": 0
    },
    {
      "method": "Got with Cookie Jar",
      "status": "failed",
      "statusCode": 200,
      "listingElements": 0
    },
    {
      "method": "Undici",
      "status": "failed",
      "statusCode": 200,
      "listingElements": 0
    },
    {
      "method": "Axios Referrer Chain",
      "status": "failed",
      "statusCode": 200,
      "listingElements": 0
    },
    {
      "method": "Mobile User Agent",
      "status": "success",
      "statusCode": 200,
      "responseTime": 383,
      "contentSize": 2271480,
      "listingElements": 83
    }
  ],
  "successful": [
    "Mobile User Agent"
  ],
  "failed": [
    "Axios Full Headers",
    "Got with Cookie Jar",
    "Undici",
    "Axios Referrer Chain"
  ]
}
```
