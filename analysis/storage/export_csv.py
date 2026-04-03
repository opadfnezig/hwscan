#!/usr/bin/env python3
"""Export clean storage listings CSV with per-unit pricing."""
import csv
import re
import sys

# Reuse the analysis helpers
sys.path.insert(0, '/root/analysis/storage/2026-03-20')
from analysis import parse_capacity_gb, detect_type, is_junk, count_drives, extract_hours, convert_to_eur

IN = '/tmp/storage_raw.csv'
OUT = '/tmp/storage_clean.csv'

fields = [
    'listing_id', 'platform', 'type', 'title', 'description',
    'capacity_gb', 'quantity', 'price', 'price_per_unit', 'currency',
    'price_eur', 'price_per_tb_eur',
    'hours', 'condition', 'item_type', 'location', 'seller_name',
    'params', 'is_auction',
]

written = 0
skipped = 0

with open(IN, 'r') as fin, open(OUT, 'w', newline='') as fout:
    reader = csv.DictReader(fin)
    writer = csv.DictWriter(fout, fieldnames=fields)
    writer.writeheader()

    for row in reader:
        title = row['title']
        desc = row['description'] or ''
        price = float(row['price'])
        currency = row['currency']
        params = row.get('params', '') or ''
        platform = row['platform']

        if is_junk(title, desc):
            skipped += 1
            continue

        dtype = detect_type(title, desc, params)
        if dtype is None:
            skipped += 1
            continue

        capacity_gb, _ = parse_capacity_gb(title)
        if capacity_gb is None:
            # try description
            capacity_gb, _ = parse_capacity_gb(desc[:500])
        if capacity_gb is None:
            skipped += 1
            continue

        if capacity_gb < 60:
            skipped += 1
            continue

        count = count_drives(title, desc)
        unit_price = price / count
        price_eur = convert_to_eur(unit_price, currency)
        price_per_tb = price_eur / (capacity_gb / 1000) if capacity_gb > 0 else None

        if price_eur < 2 or price_eur > 2000:
            skipped += 1
            continue

        hours = extract_hours(desc)
        is_auction = (row.get('item_type', '') or '').strip() == 'BIDDING'

        writer.writerow({
            'listing_id': row['listing_id'],
            'platform': platform,
            'type': dtype,
            'title': title,
            'description': desc[:2000],
            'capacity_gb': capacity_gb,
            'quantity': count,
            'price': round(unit_price, 2),
            'price_per_unit': round(unit_price, 2),
            'currency': currency,
            'price_eur': round(price_eur, 2),
            'price_per_tb_eur': round(price_per_tb, 2) if price_per_tb else '',
            'hours': hours or '',
            'condition': row.get('condition', '') or '',
            'item_type': row.get('item_type', '') or '',
            'location': row.get('location', '') or '',
            'seller_name': row.get('seller_name', '') or '',
            'params': params[:500],
            'is_auction': is_auction,
        })
        written += 1

print(f'Written: {written}, Skipped: {skipped}')
print(f'Output: {OUT}')
