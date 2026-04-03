// Price string parser — handles all platform formats.

const CURRENCY_MAP = {
  'kč': 'CZK', 'czk': 'CZK',
  '€': 'EUR',  'eur': 'EUR',
  '₴': 'UAH',  'uah': 'UAH', 'грн': 'UAH',
  'zł': 'PLN', 'pln': 'PLN',
};

const NEGOTIABLE_TOKENS = new Set(['vb', 'vhb', 'verhandlungsbasis']);

export function parsePrice(raw, fallbackCurrency = null) {
  if (raw === null || raw === undefined) {
    return { amount: null, currency: fallbackCurrency, negotiable: false };
  }

  // Already numeric (OLX, tori, aukro)
  if (typeof raw === 'number') {
    return { amount: raw, currency: fallbackCurrency, negotiable: false };
  }

  const str = String(raw);
  const lower = str.toLowerCase().trim();

  // Free / giveaway
  if (lower === 'zu verschenken' || lower === 'gratis' || lower === 'free') {
    return { amount: 0, currency: fallbackCurrency || 'EUR', negotiable: false };
  }

  // Pure negotiable with no price
  if (NEGOTIABLE_TOKENS.has(lower) || lower === 'договірна') {
    return { amount: null, currency: fallbackCurrency, negotiable: true };
  }

  const negotiable = /\b(vb|vhb)\b/i.test(str);

  // Extract numeric: strip spaces/non-breaking spaces (thousands separator), parse
  const cleaned = str.replace(/[\s\u00a0]/g, '');
  const numMatch = cleaned.match(/([\d]+(?:[.,]\d+)?)/);
  const amount = numMatch ? parseFloat(numMatch[1].replace(',', '.')) : null;

  // Extract currency
  let currency = fallbackCurrency;
  for (const [token, code] of Object.entries(CURRENCY_MAP)) {
    if (lower.includes(token)) { currency = code; break; }
  }

  return { amount, currency, negotiable };
}
