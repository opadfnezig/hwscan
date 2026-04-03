#!/usr/bin/env python3
"""
Parse storage listings from all platforms.
Goal: clean data on HDD/SSD pricing per TB, filtering out:
- RAM/memory modules
- Full computers/laptops/NAS that happen to mention storage
- Bundles of multiple drives (or split price)
- Non-working/defective drives
- External enclosures without drives
"""
import csv
import re
import json
import sys
from collections import defaultdict

# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_capacity_gb(text):
    """Extract capacity in GB from text. Returns (gb, raw_match) or (None, None)."""
    text_lower = text.lower()

    # Try TB first
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*tb', text_lower)
    if m:
        val = float(m.group(1).replace(',', '.'))
        if 0.1 <= val <= 20:  # reasonable TB range
            return int(val * 1000), m.group(0)

    # Then GB
    m = re.search(r'(\d+)\s*gb', text_lower)
    if m:
        val = int(m.group(1))
        if val in [16, 32, 60, 64, 120, 128, 240, 250, 256, 480, 500, 512, 960, 1000]:
            return val, m.group(0)

    return None, None


def detect_type(title, desc='', params=''):
    """Detect SSD vs HDD. Returns 'SSD', 'HDD', or None."""
    text = f"{title} {desc[:200]} {params}".lower()

    ssd_signals = ['ssd', 'nvme', 'm.2', 'm2', 'solid state', 'nand', 'samsung 8', 'samsung 9',
                   'crucial', 'evo ', '970 ', '980 ', '990 ', '860 ', '870 ', '850 ',
                   'a400', 'a2000', 'sn7', 'sn8', 'sn5', 'mp600', 'firecuda 5',
                   'sabrent', 'wd blue sn', 'wd black sn', 'p5 plus', 'rocket']
    hdd_signals = ['hdd', 'hard drive', 'hard disk', 'festplatte', 'harddisk', 'pevný disk',
                   'kiintolevy', 'dysk twardy', 'winchester', 'жорсткий', 'жесткий',
                   'rpm', '7200', '5400', '5900', 'barracuda', 'ironwolf', 'ultrastar',
                   'wd red', 'wd purple', 'wd gold', 'wd blue ', 'wd black ',
                   'caviar', 'toshiba p300', 'toshiba x300', 'exos', 'deskstar',
                   'nas drive', 'surveillance']

    ssd_score = sum(1 for s in ssd_signals if s in text)
    hdd_score = sum(1 for s in hdd_signals if s in text)

    if ssd_score > hdd_score:
        return 'SSD'
    elif hdd_score > ssd_score:
        return 'HDD'

    # Check params for Art/type
    if 'festplatte' in text and 'ssd' not in text:
        return 'HDD'

    return None


def is_bundle(title, desc=''):
    """Detect if listing is a bundle of multiple drives."""
    text = f"{title} {desc[:300]}".lower()

    # "2x", "3x", "4x" etc before capacity
    if re.search(r'\b[2-9]\s*[x×]\s*\d+\s*(gb|tb)', text):
        return True
    # "2 stück", "3 kusy", "lot of"
    if re.search(r'\b[2-9]\s*(stück|stk|ks|kusy|kusů|kpl|szt|шт|pieces?|pcs)\b', text):
        return True
    if re.search(r'\b(lot|bundle|set|paket|sada|zestaw|комплект)\b', text):
        return True

    return False


def count_drives(title, desc=''):
    """Try to detect how many drives in listing. Returns count."""
    text = f"{title}".lower()

    m = re.search(r'\b([2-9])\s*[x×]\s*\d+\s*(gb|tb)', text)
    if m:
        return int(m.group(1))

    m = re.search(r'\b([2-9])\s*(stück|stk|ks|kusy|kusů|kpl|szt|шт|pieces?|pcs)\b', text)
    if m:
        return int(m.group(1))

    return 1


def is_junk(title, desc=''):
    """Filter out non-drive listings."""
    text = f"{title} {desc[:500]}".lower()

    # RAM/memory
    if re.search(r'\b(ram|ddr[2345]|dimm|so-?dimm|paměť|muisti|pamięć|оперативн|arbeitsspeicher)\b', text):
        # But not if it also clearly mentions SSD/HDD
        if not re.search(r'\b(ssd|hdd|hard.?d|festplatte|nvme)\b', text):
            return True

    # Full computers/laptops/phones/tablets/monitors/printers
    if re.search(r'\b(laptop|notebook|imac|macbook|thinkpad|desktop|pc\b|počítač|komputer|комп\'ютер|компьютер|iphone|ipad|tablet|playstation|ps[45]|xbox|server\b|nas\b|qnap|synology|gaming.?pc|workstation|rechner|all.?in.?one|mini.?pc|dell|lenovo|acer|asus.*laptop|hp\s+(pro|elite|z\d)|rack|schnittrechner|mac.?pro)', text):
        # Only if the title is about the computer, not about a drive for it
        if not re.search(r'\b(für|for|do|pro|till|для)\b.*\b(ssd|hdd|festplatte|hard)', text):
            if not re.search(r'\b(ssd|hdd|nvme|festplatte|hard.?d)\b.*\b(für|for|do|pro|till|для)\b', text):
                return True

    # VB/negotiable-priced listings at absurdly low price (e.g. 1-5€ gaming PCs)
    # These are "VB" (Verhandlungsbasis) placeholder prices
    if re.search(r'\b(gaming|rtx\s*[345]\d|geforce|radeon|ryzen|intel\s*i[3579]|xeon)\b', text):
        if not re.search(r'\b(ssd|hdd|nvme|festplatte|hard.?d|kiintolevy|dysk)\b', title.lower()):
            return True

    # External drives/enclosures
    if re.search(r'\b(external|extern|ulkoinen|zewnętrzn|зовнішн|přenosn|portable)\b', text):
        return True

    # USB sticks, flash drives, SD cards
    if re.search(r'\b(usb.?stick|flash.?drive|sd.?card|pendrive|micro.?sd|memory.?card|cf.?card)\b', text):
        return True

    # Title is primarily about a system, SSD/HDD just specs
    title_lower = title.lower()
    if re.search(r'\b(gaming|komplett|computer|rechner|pc\b|laptop|notebook|imac|mac\b)', title_lower):
        # Title leads with system, storage is just a spec
        ssd_hdd_pos = len(title_lower)
        for kw in ['ssd', 'hdd', 'nvme', 'festplatte']:
            p = title_lower.find(kw)
            if p >= 0:
                ssd_hdd_pos = min(ssd_hdd_pos, p)
        system_pos = len(title_lower)
        for kw in ['gaming', 'komplett', 'computer', 'rechner', 'pc', 'laptop', 'notebook', 'imac', 'mac']:
            p = title_lower.find(kw)
            if p >= 0:
                system_pos = min(system_pos, p)
        if system_pos < ssd_hdd_pos:
            return True

    # Defective/broken
    if re.search(r'\b(defekt|kaputt|broken|nefunkční|defect|bad.?sector|не працює|nie działa|rikki|viallinen|uszkodzony|nefunkčn)\b', text):
        return True

    # Enclosures without drives
    if re.search(r'\b(gehäuse|enclosure|kotelo|obudowa|без диск[ау]|without.?drive|leer|empty|case only)\b', text):
        if not re.search(r'\b(mit|with|including|inkl)\b', text):
            return True

    # Want-to-buy / search listings
    if re.search(r'\b(suche|szukam|hledám|ищу|шукаю|etsin|wanted|looking for)\b', title.lower()):
        return True

    # Cables, adapters
    if re.search(r'\b(kabel|cable|adapter|caddy|einbaurahmen|bracket|dock|docking)\b', text):
        if not re.search(r'\b(inkl|mit|with|включ)\b.*\b(ssd|hdd)\b', text):
            return True

    return False


def extract_hours(desc):
    """Try to extract power-on hours from description."""
    if not desc:
        return None
    text = desc.lower()

    # Common patterns: "1234 hours", "1234h", "betriebsstunden: 1234", "hours: 1234"
    patterns = [
        r'(?:power.?on|betriebsstunden|hours?|stunden|godzin|hodin|tuntia|годин|часов?)\s*[:\-=]?\s*(\d[\d\s.,]*\d)',
        r'(\d[\d\s.,]*\d)\s*(?:hours?|stunden|h\b|godzin|hodin|tuntia|годин|часов)',
        r'(?:s\.m\.a\.r\.t|smart|crystal|cdn).*?(\d[\d\s.,]*\d)\s*(?:h\b|hour)',
    ]

    for pat in patterns:
        m = re.search(pat, text)
        if m:
            val = m.group(1).replace(' ', '').replace('.', '').replace(',', '')
            try:
                hours = int(val)
                if 10 <= hours <= 200000:  # reasonable range
                    return hours
            except:
                pass

    return None


def convert_to_eur(price, currency):
    """Rough conversion to EUR for comparison."""
    rates = {
        'EUR': 1.0,
        'CZK': 0.040,   # ~25 CZK/EUR
        'PLN': 0.23,     # ~4.3 PLN/EUR
        'UAH': 0.023,    # ~43 UAH/EUR
    }
    return price * rates.get(currency, 1.0)


# ── Main processing ─────────────────────────────────────────────────────────

listings = []
skipped = defaultdict(int)

with open('/tmp/storage_listings.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        title = row['title']
        desc = row['description'] or ''
        price = float(row['price'])
        currency = row['currency']
        params = row['params'] or ''
        platform = row['platform']
        item_type = row.get('item_type', '')

        # Skip junk
        if is_junk(title, desc):
            skipped['junk'] += 1
            continue

        # Detect type
        dtype = detect_type(title, desc, params)
        if dtype is None:
            skipped['unknown_type'] += 1
            continue

        # Parse capacity
        capacity_gb, _ = parse_capacity_gb(title)
        if capacity_gb is None:
            skipped['no_capacity'] += 1
            continue

        # Skip tiny drives (< 60GB) - likely not standalone drives
        if capacity_gb < 60:
            skipped['too_small'] += 1
            continue

        # Handle bundles - split price
        count = count_drives(title, desc)
        unit_price = price / count

        # Skip unreasonably priced
        price_eur = convert_to_eur(unit_price, currency)
        price_per_tb_eur = price_eur / (capacity_gb / 1000) if capacity_gb > 0 else 999

        if price_eur < 2 or price_eur > 2000:
            skipped['price_outlier'] += 1
            continue

        # Sanity: price per TB should be reasonable
        if price_per_tb_eur > 500 and capacity_gb >= 500:
            skipped['price_per_tb_outlier'] += 1
            continue

        hours = extract_hours(desc)

        is_auction = item_type == 'BIDDING'

        # Capacity bucket
        if capacity_gb < 1000:
            cap_bucket = f"<1TB"
        elif capacity_gb <= 1000:
            cap_bucket = "1TB"
        elif capacity_gb <= 2000:
            cap_bucket = "2TB"
        elif capacity_gb <= 3000:
            cap_bucket = "3TB"
        elif capacity_gb <= 4000:
            cap_bucket = "4TB"
        elif capacity_gb <= 8000:
            cap_bucket = "8TB"
        elif capacity_gb <= 10000:
            cap_bucket = "10TB"
        else:
            cap_bucket = "12TB+"

        listings.append({
            'platform': platform,
            'listing_id': row['listing_id'],
            'title': title,
            'dtype': dtype,
            'capacity_gb': capacity_gb,
            'cap_bucket': cap_bucket,
            'price': unit_price,
            'currency': currency,
            'price_eur': price_eur,
            'price_per_tb_eur': price_per_tb_eur,
            'hours': hours,
            'is_auction': is_auction,
            'count': count,
        })

print(f"Parsed {len(listings)} clean listings from {sum(skipped.values()) + len(listings)} total")
print(f"Skipped: {dict(skipped)}")
print()

# ── Analysis ─────────────────────────────────────────────────────────────────

# Group by platform, type, capacity bucket
from statistics import median, mean

def analyze_group(items):
    if not items:
        return None
    prices = sorted([i['price_eur'] for i in items])
    hours_list = [i['hours'] for i in items if i['hours'] is not None]
    per_tb = sorted([i['price_per_tb_eur'] for i in items])

    return {
        'n': len(items),
        'min': prices[0],
        'p10': prices[len(prices)//10] if len(prices) >= 10 else prices[0],
        'median': median(prices),
        'mean': mean(prices),
        'max': prices[-1],
        'per_tb_min': per_tb[0],
        'per_tb_p10': per_tb[len(per_tb)//10] if len(per_tb) >= 10 else per_tb[0],
        'per_tb_median': median(per_tb),
        'per_tb_mean': mean(per_tb),
        'hours_n': len(hours_list),
        'hours_median': median(hours_list) if hours_list else None,
        'hours_mean': mean(hours_list) if hours_list else None,
    }

# Print per platform
platforms = ['kleinanzeigen.de', 'olx.pl', 'olx.ua', 'tori.fi', 'aukro.cz', 'bazos.cz', 'bazos.sk']
cap_order = ['<1TB', '1TB', '2TB', '3TB', '4TB', '8TB', '10TB', '12TB+']

for dtype in ['HDD', 'SSD']:
    print(f"\n{'='*100}")
    print(f"  {dtype} PRICING ANALYSIS")
    print(f"{'='*100}")

    for platform in platforms:
        items = [l for l in listings if l['platform'] == platform and l['dtype'] == dtype and not l['is_auction']]
        if not items:
            continue

        print(f"\n── {platform} ({dtype}) ── {len(items)} listings ──")
        print(f"  {'Capacity':<8} {'n':>4} {'Bottom':>8} {'P10':>8} {'Median':>8} {'Avg':>8} {'€/TB bot':>9} {'€/TB med':>9} {'Hours n':>8} {'Hours med':>9} {'Hours avg':>9}")

        for bucket in cap_order:
            group = [i for i in items if i['cap_bucket'] == bucket]
            if not group:
                continue
            s = analyze_group(group)
            hours_med = f"{s['hours_median']:.0f}" if s['hours_median'] else '-'
            hours_avg = f"{s['hours_mean']:.0f}" if s['hours_mean'] else '-'
            print(f"  {bucket:<8} {s['n']:>4} {s['min']:>7.1f}€ {s['p10']:>7.1f}€ {s['median']:>7.1f}€ {s['mean']:>7.1f}€ {s['per_tb_min']:>8.1f}€ {s['per_tb_median']:>8.1f}€ {s['hours_n']:>8} {hours_med:>9} {hours_avg:>9}")

        # Total for this platform
        s = analyze_group(items)
        if s:
            hours_med = f"{s['hours_median']:.0f}" if s['hours_median'] else '-'
            hours_avg = f"{s['hours_mean']:.0f}" if s['hours_mean'] else '-'
            print(f"  {'ALL':<8} {s['n']:>4} {s['min']:>7.1f}€ {s['p10']:>7.1f}€ {s['median']:>7.1f}€ {s['mean']:>7.1f}€ {s['per_tb_min']:>8.1f}€ {s['per_tb_median']:>8.1f}€ {s['hours_n']:>8} {hours_med:>9} {hours_avg:>9}")

    # Auctions separately
    auc_items = [l for l in listings if l['dtype'] == dtype and l['is_auction']]
    if auc_items:
        print(f"\n── AUCTIONS ({dtype}) ── {len(auc_items)} listings ──")
        print(f"  {'Capacity':<8} {'n':>4} {'Start€':>8} {'Median':>8} {'Avg':>8} {'€/TB med':>9}")
        for bucket in cap_order:
            group = [i for i in auc_items if i['cap_bucket'] == bucket]
            if not group:
                continue
            s = analyze_group(group)
            print(f"  {bucket:<8} {s['n']:>4} {s['min']:>7.1f}€ {s['median']:>7.1f}€ {s['mean']:>7.1f}€ {s['per_tb_median']:>8.1f}€")


# ── Cross-platform comparison ────────────────────────────────────────────────

print(f"\n{'='*100}")
print(f"  CROSS-PLATFORM COMPARISON (€/TB median, buy-now only)")
print(f"{'='*100}")

for dtype in ['HDD', 'SSD']:
    print(f"\n  {dtype}:")
    print(f"  {'Platform':<20}", end='')
    for bucket in cap_order:
        print(f" {bucket:>8}", end='')
    print()

    for platform in platforms:
        items = [l for l in listings if l['platform'] == platform and l['dtype'] == dtype and not l['is_auction']]
        if not items:
            continue
        print(f"  {platform:<20}", end='')
        for bucket in cap_order:
            group = [i for i in items if i['cap_bucket'] == bucket]
            if group:
                med = median([i['price_per_tb_eur'] for i in group])
                print(f" {med:>7.1f}€", end='')
            else:
                print(f" {'—':>8}", end='')
        print()

# ── Sample listings for sanity check ─────────────────────────────────────────

print(f"\n{'='*100}")
print(f"  SAMPLE LISTINGS (cheapest per TB by type/capacity)")
print(f"{'='*100}")

for dtype in ['HDD', 'SSD']:
    for bucket in ['1TB', '2TB', '4TB', '8TB']:
        group = [l for l in listings if l['dtype'] == dtype and l['cap_bucket'] == bucket and not l['is_auction']]
        if not group:
            continue
        group.sort(key=lambda x: x['price_per_tb_eur'])
        print(f"\n  {dtype} {bucket} — cheapest:")
        for item in group[:3]:
            print(f"    {item['price']:.0f} {item['currency']} ({item['price_eur']:.1f}€, {item['price_per_tb_eur']:.1f}€/TB) [{item['platform']}] {item['title'][:80]}")
        print(f"  {dtype} {bucket} — median range:")
        mid = len(group) // 2
        for item in group[max(0,mid-1):mid+2]:
            print(f"    {item['price']:.0f} {item['currency']} ({item['price_eur']:.1f}€, {item['price_per_tb_eur']:.1f}€/TB) [{item['platform']}] {item['title'][:80]}")
