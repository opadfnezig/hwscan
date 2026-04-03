// observe.js — shared observability module
// Provides: structured logging, health state, Telegram alerts, kafka event hooks.
// Copied into each scraper's src/ directory (Docker build context isolation).

const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const PLATFORM_NAME    = process.env.PLATFORM_NAME || process.env.DOMAIN || 'unknown';
const ALERT_THRESHOLD  = parseInt(process.env.ALERT_FAIL_THRESHOLD || '5', 10);

// ── Health state (read by controller /health) ────────────────────────────────

export const healthState = {
  errors: 0,
  lastSuccess: null,
  lastError: null,
  consecutiveFails: 0,
  pollErrors: 0,
};

// ── Structured logger ────────────────────────────────────────────────────────

export function createLogger(component) {
  const write = (level, msg, extra) => {
    const line = { ts: new Date().toISOString(), level, component, msg };
    if (extra) Object.assign(line, extra);
    process.stdout.write(JSON.stringify(line) + '\n');
  };
  return {
    info:  (msg, extra) => write('info',  msg, extra),
    warn:  (msg, extra) => write('warn',  msg, extra),
    error: (msg, extra) => write('error', msg, extra),
  };
}

// ── Telegram alerts ──────────────────────────────────────────────────────────

let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 60_000; // 1 min between alerts

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (_) { /* alerting must never crash the process */ }
}

export function alertTelegram(msg) {
  return sendTelegram(`[hw5c4n] <b>${PLATFORM_NAME}</b>\n${msg}`);
}

// ── Kafka producer hooks ─────────────────────────────────────────────────────

export function attachKafkaEvents(producer, log) {
  producer.on(producer.events.REQUEST_TIMEOUT, async (e) => {
    log.error('kafka timeout', { broker: e.payload?.broker });
    await alertTelegram(`Kafka request timeout — broker: ${e.payload?.broker}`);
  });
  producer.on(producer.events.DISCONNECT, async () => {
    log.warn('kafka producer disconnected');
    await alertTelegram('Kafka producer disconnected');
  });
}

// ── Poll error tracking ──────────────────────────────────────────────────────

export function withPollTracking(pollFn, log) {
  return async (...args) => {
    try {
      const result = await pollFn(...args);
      healthState.pollErrors = 0;
      return result;
    } catch (err) {
      healthState.pollErrors++;
      healthState.errors++;
      healthState.lastError = new Date().toISOString();
      log.error('poll error', { err: err.message, consecutive: healthState.pollErrors });
      if (healthState.pollErrors >= ALERT_THRESHOLD) {
        await alertTelegram(`Poll failing for ${healthState.pollErrors} cycles\n${err.message}`);
        healthState.pollErrors = 0;
      }
      throw err;
    }
  };
}
