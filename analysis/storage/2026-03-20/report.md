# Used Storage Market Analysis — 2026-03-20

**Data:** 3,513 clean drive listings across 6 platforms (after filtering ~16k junk: full PCs, RAM, bundles, broken, external enclosures, want-to-buy posts)

**Caveat:** Bottom prices still contain some noise (PC listings priced at 2-3€ with SSD as a spec). P10 and median are reliable. Hours data is sparse — most sellers don't include SMART data.

---

## HDD — Price per TB (EUR, buy-now only)

| Capacity | kleinanzeigen.de | olx.pl | olx.ua | tori.fi | aukro.cz |
|----------|-----------------|--------|--------|---------|----------|
| <1TB     | 40.0€/TB (n=99) | 26.0€ (n=102) | 20.7€ (n=153) | 30.0€ (n=15) | 16.0€ (n=9) |
| 1TB      | 29.0€/TB (n=149) | 23.0€ (n=88) | 31.1€ (n=100) | 20.0€ (n=13) | 19.2€ (n=5) |
| 2TB      | 25.0€/TB (n=112) | 25.3€ (n=47) | 23.0€ (n=57) | 35.0€ (n=6) | 12.2€ (n=3) |
| 3TB      | 19.8€/TB (n=28) | 18.1€ (n=8) | 17.6€ (n=15) | — | — |
| 4TB      | 23.8€/TB (n=61) | 21.9€ (n=11) | 21.3€ (n=41) | 38.8€ (n=4) | 10.0€ (n=1) |
| 8TB      | 20.0€/TB (n=51) | 21.6€ (n=21) | 17.0€ (n=37) | 32.8€ (n=4) | — |
| 10TB     | 13.9€/TB (n=8) | 22.8€ (n=5) | 28.7€ (n=8) | — | — |
| 12TB+    | 18.2€/TB (n=42) | 17.2€ (n=25) | 13.0€ (n=24) | 25.6€ (n=1) | — |

### HDD Key Findings

- **Sweet spot: 3-4TB at ~20€/TB** — best price/capacity ratio across all markets
- **8TB+ drops to 13-20€/TB** — enterprise pulls (Ultrastar, Exos) drive this down
- **Ukraine (olx.ua) cheapest overall** — 12TB+ at 13€/TB median, likely ex-datacenter
- **Finland (tori.fi) most expensive** — 30-40% premium over continental Europe
- **Aukro.cz auctions start very low** — 3-10€ starting prices, small sample size

### HDD Median Price per Drive

| Capacity | DE | PL | UA | FI | CZ |
|----------|-----|-----|-----|-----|-----|
| 1TB      | 29€ | 23€ | 31€ | 20€ | 19€ |
| 2TB      | 50€ | 51€ | 46€ | 70€ | 24€ |
| 4TB      | 95€ | 87€ | 85€ | 155€ | 40€ |
| 8TB      | 110€ | 173€ | 115€ | 188€ | — |
| 12TB+    | 250€ | 276€ | 189€ | 359€ | — |

---

## SSD — Price per TB (EUR, buy-now only)

| Capacity | kleinanzeigen.de | olx.pl | olx.ua | tori.fi | aukro.cz |
|----------|-----------------|--------|--------|---------|----------|
| <1TB     | 117€/TB (n=361) | 116€ (n=274) | 135€ (n=432) | 146€ (n=59) | 120€ (n=16) |
| 1TB      | 115€/TB (n=233) | 110€ (n=99) | 120€ (n=170) | 110€ (n=30) | 200€ (n=5) |
| 2TB      | 95€/TB (n=123) | 96€ (n=73) | 104€ (n=99) | 105€ (n=15) | 104€ (n=5) |
| 4TB      | 88€/TB (n=55) | 81€ (n=19) | 98€ (n=31) | 106€ (n=4) | 78€ (n=1) |
| 8TB      | 110€/TB (n=4) | 95€ (n=2) | 87€ (n=8) | 150€ (n=1) | — |

### SSD Key Findings

- **1TB is the volume king** — most listings, prices converging around 110-120€/TB
- **2TB+ gets cheaper per TB** — drops to 88-105€/TB, bulk discount effect
- **Prices remarkably consistent across markets** — unlike HDD, SSD pricing is within 10-15% across DE/PL/UA
- **Finland premium** — ~10-20% higher on SSD too
- **4TB sweet spot for price/TB** — 78-88€/TB on mainland Europe

### SSD Median Price per Drive

| Capacity | DE | PL | UA | FI | CZ |
|----------|-----|-----|-----|-----|-----|
| 256GB    | ~30€ | ~23€ | ~28€ | ~38€ | ~20€ |
| 512GB    | ~45€ | ~35€ | ~46€ | ~59€ | ~31€ |
| 1TB      | 115€ | 110€ | 120€ | 110€ | 200€ |
| 2TB      | 190€ | 189€ | 207€ | 210€ | 200€ |
| 4TB      | 350€ | 322€ | 390€ | 425€ | 311€ |

---

## HDD Hours (Power-On Time)

Very sparse data — only ~50 out of 1,350+ HDD listings include hours.

| Segment | n | Median Hours | Avg Hours |
|---------|---|-------------|-----------|
| Bottom-price HDDs | 24 | 252h | 13,034h |
| All HDDs with hours | 56 | ~2,000h | ~7,000h |

The average is skewed by a few 60k+ hour enterprise pulls. Most consumer drives listed show under 5,000 hours.

---

## SSD Hours

Similarly sparse — ~87 out of 2,100+ SSD listings include hours.

| Platform | n | Median Hours | Avg Hours |
|----------|---|-------------|-----------|
| olx.pl   | 33 | 389h | 1,739h |
| olx.ua   | 29 | 296h | 1,563h |
| kleinanzeigen.de | 13 | 1,000h | 9,061h |
| tori.fi  | 6 | 8,010h | 13,592h |
| aukro.cz | 6 | 48h | 4,730h |

DE and FI skewed by some high-hour enterprise drives. PL and UA show mostly low-hour consumer drives (under 500h median).

---

## Aukro Auctions (separate metric)

| Type | Capacity | n | Start Price | Median | €/TB med |
|------|----------|---|------------|--------|----------|
| HDD | <1TB | 2 | 3.3€ | 6.7€ | 13.3€ |
| HDD | 2TB | 1 | 9.9€ | 9.9€ | 4.9€ |
| HDD | 3TB | 1 | 9.7€ | 9.7€ | 3.2€ |
| HDD | 4TB | 2 | 80€ | 111€ | 27.7€ |
| SSD | <1TB | 18 | 3.9€ | 17.2€ | 49.1€ |
| SSD | 1TB | 3 | 5.2€ | 60€ | 60€ |
| SSD | 2TB | 3 | 2.2€ | 37.8€ | 18.9€ |

Small sample — auctions start very low but limited volume (32 total drive auctions).

---

## Cross-Platform Summary

**Cheapest for HDDs:** Ukraine (olx.ua) — ex-datacenter enterprise drives at 13-17€/TB for high capacity
**Cheapest for SSDs:** Poland (olx.pl) — 81€/TB for 4TB, 96€/TB for 2TB
**Most expensive:** Finland (tori.fi) — 25-40% premium across the board
**Best value overall:** 4TB SSD at ~85€/TB or 8TB HDD at ~18€/TB on DE/PL/UA

---

## Data Quality Notes

- Filtered out ~16k listings: full PCs (biggest source of noise), RAM modules, NAS boxes, bundles, defective drives, external enclosures, cables, want-to-buy posts
- Some noise remains in bottom prices (PCs listed at 1-5€ with SSD as a spec line)
- P10 (10th percentile) and median are clean and reliable
- Hours data too sparse for strong conclusions — <5% of listings include SMART hours
- Currency conversions: 1€ ≈ 25 CZK ≈ 4.3 PLN ≈ 43 UAH (approximate)
