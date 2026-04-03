#!/usr/bin/env python3
import psycopg2
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime
import json
import os

OUT = '/root/analysis/tori/2026-03-17'
conn = psycopg2.connect(os.environ.get("DATABASE_URL", "postgresql://hw5c4n:changeme@localhost:5432/hw5c4n"))

# Category short names (Finnish → English-ish)
CAT_SHORT = {
    'Tietokonekomponentit': 'Components',
    'Oheislaitteet': 'Peripherals',
    'Kannettavat tietokoneet': 'Laptops',
    'Verkkolaitteet': 'Networking',
    'Pöytäkoneet': 'Desktops',
    'Näytöt': 'Monitors',
    'Tabletit ja lukulaitteet': 'Tablets',
    'Kiintolevyt ja tallennustila': 'Storage',
    'Tietotekniikka': 'IT (general)',
    'Ohjelmistot': 'Software',
    'Laskimet': 'Calculators',
}

def short_cat(path):
    if not path:
        return 'Unknown'
    parts = path.split(' > ')
    leaf = parts[-1] if len(parts) > 0 else path
    return CAT_SHORT.get(leaf, leaf[:20])

# ═══════════════════════════════════════════════════════════════════════════════
# 1. Daily activity: created, deleted, by condition
# ═══════════════════════════════════════════════════════════════════════════════

df_daily = pd.read_sql("""
  SELECT
    date_trunc('day', scraped_at)::date AS day,
    count(*) AS created,
    count(*) FILTER (WHERE is_deleted) AS deleted,
    count(*) FILTER (WHERE NOT is_deleted) AS active,
    count(*) FILTER (WHERE condition = 'New') AS new_cond,
    count(*) FILTER (WHERE condition = 'Used') AS used_cond,
    round(avg(price)::numeric, 2) AS avg_price,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric, 2) AS median_price
  FROM listings
  WHERE platform = 'tori.fi'
  GROUP BY 1
  ORDER BY 1
""", conn)

df_daily['day'] = pd.to_datetime(df_daily['day'])
df_daily = df_daily.set_index('day')
all_days = pd.date_range(df_daily.index.min(), df_daily.index.max(), freq='D')
df_daily = df_daily.reindex(all_days, fill_value=0)
df_daily['deletion_rate'] = (df_daily.deleted / df_daily.created.replace(0, 1) * 100).round(1)

# ── Figure 1: Daily overview ──────────────────────────────────────────────────
fig, axes = plt.subplots(3, 1, figsize=(14, 12), sharex=True)
fig.suptitle('Tori.fi Market Activity — Daily Breakdown', fontsize=16, fontweight='bold')

ax = axes[0]
ax.bar(df_daily.index - pd.Timedelta(hours=4), df_daily.created, width=0.35,
       label='Total created', color='#4C72B0', alpha=0.85)
ax.bar(df_daily.index + pd.Timedelta(hours=4), df_daily.deleted, width=0.35,
       label='Deleted/Removed', color='#C44E52', alpha=0.85)
ax.set_ylabel('Listings')
ax.legend(loc='upper left')
ax.grid(axis='y', alpha=0.3)
ax.set_title('New Listings vs Deletions per Day')

ax = axes[1]
ax.bar(df_daily.index - pd.Timedelta(hours=4), df_daily.new_cond, width=0.35,
       label='New condition', color='#55A868', alpha=0.85)
ax.bar(df_daily.index + pd.Timedelta(hours=4), df_daily.used_cond, width=0.35,
       label='Used condition', color='#DD8452', alpha=0.85)
ax.set_ylabel('Listings')
ax.legend(loc='upper left')
ax.grid(axis='y', alpha=0.3)
ax.set_title('New vs Used Condition per Day')

ax = axes[2]
ax.plot(df_daily.index, df_daily.median_price, 'o-', color='#4C72B0',
        label='Median price', linewidth=2, markersize=5)
ax.plot(df_daily.index, df_daily.avg_price, 's--', color='#C44E52',
        label='Avg price', linewidth=1.5, markersize=4, alpha=0.7)
ax.set_ylabel('Price (EUR)')
ax.legend(loc='upper left')
ax.grid(axis='y', alpha=0.3)
ax.set_title('Price Trends (EUR)')

for ax in axes:
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%a\n%b %d'))
    ax.xaxis.set_major_locator(mdates.DayLocator())

plt.tight_layout()
plt.savefig(f'{OUT}/tori-daily.png', dpi=150, bbox_inches='tight')
print(f'Saved {OUT}/tori-daily.png')

# Print daily table
print('\n═══ Daily Summary ═══')
print(f'{"Day":<12} {"Created":>8} {"Deleted":>8} {"Active":>8} {"Del%":>6} {"New":>6} {"Used":>6} {"MedPrice":>9} {"AvgPrice":>9}')
for d in all_days:
    r = df_daily.loc[d]
    print(f'{d.strftime("%a %b %d"):<12} {int(r.created):>8} {int(r.deleted):>8} {int(r.active):>8} {r.deletion_rate:>5.1f}% {int(r.new_cond):>6} {int(r.used_cond):>6} {r.median_price:>8.0f}€ {r.avg_price:>8.0f}€')

# ═══════════════════════════════════════════════════════════════════════════════
# 2. Category breakdown: listed vs deleted, by condition
# ═══════════════════════════════════════════════════════════════════════════════

df_cat = pd.read_sql("""
  SELECT
    extras->>'category_path' AS category_path,
    count(*) AS listed,
    count(*) FILTER (WHERE is_deleted) AS deleted,
    count(*) FILTER (WHERE NOT is_deleted) AS active,
    count(*) FILTER (WHERE condition = 'New') AS new_cond,
    count(*) FILTER (WHERE condition = 'Used') AS used_cond,
    round(avg(price)::numeric, 0) AS avg_price,
    round(avg(price) FILTER (WHERE is_deleted)::numeric, 0) AS avg_del_price,
    round(avg(price) FILTER (WHERE NOT is_deleted)::numeric, 0) AS avg_active_price,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) AS median_price
  FROM listings
  WHERE platform = 'tori.fi'
  GROUP BY 1
  ORDER BY listed DESC
""", conn)

df_cat['category'] = df_cat['category_path'].apply(short_cat)
df_cat['del_rate'] = (df_cat.deleted / df_cat.listed * 100).round(1)

top = df_cat.head(10)

# ── Figure 2: Category breakdown ─────────────────────────────────────────────
fig, axes = plt.subplots(2, 2, figsize=(16, 12))
fig.suptitle('Tori.fi — Category Breakdown', fontsize=16, fontweight='bold')

# Top categories by listing count
ax = axes[0][0]
ax.barh(top.category[::-1], top.listed[::-1], color='#cccccc', label='Total listed')
ax.barh(top.category[::-1], top.deleted[::-1], color='#C44E52', label='Deleted')
ax.set_title('Top Categories (Listed vs Deleted)')
ax.legend(loc='lower right')
ax.grid(axis='x', alpha=0.3)

# Deletion rate by category
ax = axes[0][1]
top_sorted = top.sort_values('del_rate', ascending=True)
colors = ['#C44E52' if r > 40 else '#DD8452' if r > 25 else '#55A868' for r in top_sorted.del_rate]
ax.barh(top_sorted.category, top_sorted.del_rate, color=colors, alpha=0.8)
ax.set_title('Deletion Rate by Category')
ax.set_xlabel('Deleted %')
ax.axvline(x=30, color='gray', linestyle='--', alpha=0.3)
ax.grid(axis='x', alpha=0.3)

# Condition distribution
ax = axes[1][0]
x_pos = range(len(top))
w = 0.35
ax.barh([x - w/2 for x in x_pos], top.new_cond[::-1].values, height=w,
        label='New', color='#55A868', alpha=0.8)
ax.barh([x + w/2 for x in x_pos], top.used_cond[::-1].values, height=w,
        label='Used', color='#DD8452', alpha=0.8)
ax.set_yticks(list(x_pos))
ax.set_yticklabels(top.category[::-1].values)
ax.set_title('New vs Used by Category')
ax.legend(loc='lower right')
ax.grid(axis='x', alpha=0.3)

# Median price by category
ax = axes[1][1]
ax.barh(top.category[::-1], top.median_price[::-1], color='#4C72B0', alpha=0.8)
for i, (cat, price) in enumerate(zip(top.category[::-1], top.median_price[::-1])):
    ax.text(price + 2, i, f'{price:.0f}€', va='center', fontsize=8)
ax.set_title('Median Price by Category (EUR)')
ax.set_xlabel('EUR')
ax.grid(axis='x', alpha=0.3)

plt.tight_layout()
plt.savefig(f'{OUT}/tori-categories.png', dpi=150, bbox_inches='tight')
print(f'\nSaved {OUT}/tori-categories.png')

# Print category table
print('\n═══ Category Summary ═══')
print(f'{"Category":<20} {"Listed":>7} {"Deleted":>8} {"Active":>7} {"Del%":>6} {"New":>5} {"Used":>5} {"MedPrice":>9} {"AvgDel":>8} {"AvgAct":>8}')
for _, r in top.iterrows():
    print(f'{r.category[:19]:<20} {int(r.listed):>7} {int(r.deleted):>8} {int(r.active):>7} {r.del_rate:>5.1f}% {int(r.new_cond):>5} {int(r.used_cond):>5} {r.median_price:>8.0f}€ {r.avg_del_price or 0:>7.0f}€ {r.avg_active_price or 0:>7.0f}€')

# ═══════════════════════════════════════════════════════════════════════════════
# 3. Price analysis: deleted vs active — pricing patterns
# ═══════════════════════════════════════════════════════════════════════════════

df_price = pd.read_sql("""
  SELECT
    CASE WHEN is_deleted THEN 'DELETED' ELSE 'ACTIVE' END AS status,
    condition,
    price,
    extras->>'category_path' AS category_path
  FROM listings
  WHERE platform = 'tori.fi' AND price IS NOT NULL AND price > 0 AND price < 10000
""", conn)

df_price['category'] = df_price['category_path'].apply(short_cat)

# ── Figure 3: Price distributions ────────────────────────────────────────────
fig, axes = plt.subplots(2, 2, figsize=(16, 10))
fig.suptitle('Tori.fi — Price Analysis: Active vs Deleted', fontsize=16, fontweight='bold')

# Overall price distribution by status
ax = axes[0][0]
for status, color, alpha in [('ACTIVE', '#4C72B0', 0.6), ('DELETED', '#C44E52', 0.4)]:
    data = df_price[df_price.status == status].price
    if len(data) > 0:
        ax.hist(data.clip(upper=2000), bins=50, alpha=alpha, color=color,
                label=f'{status} (n={len(data)}, med={data.median():.0f}€)')
ax.set_title('Price Distribution — All Categories')
ax.set_xlabel('Price (EUR)')
ax.set_ylabel('Count')
ax.legend(fontsize=9)
ax.grid(alpha=0.3)

# Price distribution by condition
ax = axes[0][1]
for cond, color in [('New', '#55A868'), ('Used', '#DD8452')]:
    for status, ls, alpha in [('ACTIVE', '-', 0.7), ('DELETED', '--', 0.4)]:
        data = df_price[(df_price.condition == cond) & (df_price.status == status)].price
        if len(data) > 10:
            ax.hist(data.clip(upper=2000), bins=40, alpha=alpha, color=color,
                    linestyle=ls, histtype='step', linewidth=2,
                    label=f'{cond} {status} (med={data.median():.0f}€)')
ax.set_title('Price by Condition × Status')
ax.set_xlabel('Price (EUR)')
ax.legend(fontsize=8)
ax.grid(alpha=0.3)

# Box plot by category: active vs deleted
ax = axes[1][0]
top_cats = df_price.groupby('category').size().nlargest(6).index.tolist()
sub_top = df_price[df_price.category.isin(top_cats)]

positions = []
labels = []
colors_list = []
data_list = []

for i, cat in enumerate(top_cats):
    for j, (status, color) in enumerate([('ACTIVE', '#4C72B0'), ('DELETED', '#C44E52')]):
        d = sub_top[(sub_top.category == cat) & (sub_top.status == status)].price
        if len(d) > 0:
            data_list.append(d.clip(upper=3000).values)
            positions.append(i * 3 + j)
            colors_list.append(color)

if data_list:
    bp = ax.boxplot(data_list, positions=positions, widths=0.8, patch_artist=True, showfliers=False)
    for patch, color in zip(bp['boxes'], colors_list):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    tick_pos = [i * 3 + 0.5 for i in range(len(top_cats))]
    ax.set_xticks(tick_pos)
    ax.set_xticklabels(top_cats, rotation=30, ha='right', fontsize=8)
    ax.set_ylabel('Price (EUR)')
    ax.set_title('Active (blue) vs Deleted (red) Price by Category')
    ax.grid(axis='y', alpha=0.3)

# Deletion rate by price bucket
ax = axes[1][1]
df_price['price_bucket'] = pd.cut(df_price.price, bins=[0, 10, 25, 50, 100, 200, 500, 1000, 10000],
                                   labels=['0-10', '10-25', '25-50', '50-100', '100-200', '200-500', '500-1k', '1k+'])
bucket_stats = df_price.groupby('price_bucket', observed=True).agg(
    total=('status', 'size'),
    deleted=('status', lambda x: (x == 'DELETED').sum())
).reset_index()
bucket_stats['del_rate'] = (bucket_stats.deleted / bucket_stats.total * 100).round(1)

ax.bar(bucket_stats.price_bucket.astype(str), bucket_stats.del_rate, color='#C44E52', alpha=0.7)
ax.bar(bucket_stats.price_bucket.astype(str), 100 - bucket_stats.del_rate,
       bottom=bucket_stats.del_rate, color='#4C72B0', alpha=0.3)
for i, (_, r) in enumerate(bucket_stats.iterrows()):
    ax.text(i, r.del_rate + 1, f'{r.del_rate:.0f}%\n(n={int(r.total)})', ha='center', fontsize=7)
ax.set_title('Deletion Rate by Price Range')
ax.set_xlabel('Price range (EUR)')
ax.set_ylabel('%')
ax.set_ylim(0, 100)
ax.grid(axis='y', alpha=0.3)

plt.tight_layout()
plt.savefig(f'{OUT}/tori-prices.png', dpi=150, bbox_inches='tight')
print(f'\nSaved {OUT}/tori-prices.png')

# Print price comparison
print('\n═══ Price: Active vs Deleted (median EUR) ═══')
print(f'{"Category":<20} {"Active Med":>10} {"Del Med":>10} {"Diff":>8} {"Active n":>9} {"Del n":>7}')
for cat in top_cats:
    active = df_price[(df_price.category == cat) & (df_price.status == 'ACTIVE')].price
    deleted = df_price[(df_price.category == cat) & (df_price.status == 'DELETED')].price
    if len(active) > 2 and len(deleted) > 2:
        diff_pct = ((deleted.median() - active.median()) / active.median() * 100) if active.median() > 0 else 0
        print(f'{cat[:19]:<20} {active.median():>9.0f}€ {deleted.median():>9.0f}€ {diff_pct:>+7.0f}% {len(active):>9} {len(deleted):>7}')

# ═══════════════════════════════════════════════════════════════════════════════
# 4. Location analysis
# ═══════════════════════════════════════════════════════════════════════════════

df_loc = pd.read_sql("""
  SELECT
    CASE
      WHEN location ~ ',' THEN trim(split_part(location, ',', 2))
      ELSE trim(location)
    END AS region,
    count(*) AS listed,
    count(*) FILTER (WHERE is_deleted) AS deleted,
    round(avg(price)::numeric, 0) AS avg_price,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) AS median_price
  FROM listings
  WHERE platform = 'tori.fi' AND location IS NOT NULL AND location != ''
  GROUP BY 1
  ORDER BY listed DESC
  LIMIT 15
""", conn)

df_loc['del_rate'] = (df_loc.deleted / df_loc.listed * 100).round(1)

print('\n═══ Top Regions ═══')
print(f'{"Region":<25} {"Listed":>7} {"Deleted":>8} {"Del%":>6} {"MedPrice":>9}')
for _, r in df_loc.iterrows():
    print(f'{str(r.region)[:24]:<25} {int(r.listed):>7} {int(r.deleted):>8} {r.del_rate:>5.1f}% {r.median_price:>8.0f}€')

# ═══════════════════════════════════════════════════════════════════════════════
# 5. Weekday patterns
# ═══════════════════════════════════════════════════════════════════════════════

df_weekday = pd.read_sql("""
  SELECT
    extract(isodow FROM scraped_at) AS dow,
    to_char(scraped_at, 'Dy') AS day_name,
    count(*) AS created,
    count(*) FILTER (WHERE is_deleted) AS deleted,
    round(avg(price)::numeric, 0) AS avg_price
  FROM listings
  WHERE platform = 'tori.fi'
  GROUP BY 1, 2
  ORDER BY 1
""", conn)

print('\n═══ Weekday Patterns ═══')
print(f'{"Day":<6} {"Created":>8} {"Deleted":>8} {"AvgPrice":>9}')
for _, r in df_weekday.iterrows():
    print(f'{r.day_name:<6} {int(r.created):>8} {int(r.deleted):>8} {r.avg_price:>8.0f}€')

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Change tracking
# ═══════════════════════════════════════════════════════════════════════════════

df_changes = pd.read_sql("""
  SELECT field, count(*) as changes
  FROM listing_changes
  WHERE platform = 'tori.fi'
  GROUP BY 1
  ORDER BY 2 DESC
""", conn)

if len(df_changes) > 0:
    print('\n═══ Field Changes (from rechecks) ═══')
    for _, r in df_changes.iterrows():
        print(f'  {r.field}: {int(r.changes)}')
else:
    print('\n═══ No field changes tracked yet ═══')

conn.close()
print('\nDone.')
