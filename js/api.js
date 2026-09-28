// ============================================================
// Modul API: fetch harga, berita, kalender + cache + fallback otomatis
// Urutan: cache segar -> API utama -> API cadangan -> cache basi -> error
// ============================================================
import {
  getConfig, cacheGet, cacheSet, usageGet, usageInc,
} from './utils.js';
import { demoCandles, demoNews, demoCalendar, tfSeconds } from './demo.js';

const hasKey = (k) => !!k && !/^YOUR_/i.test(k);

/** Mode proxy: 'auto' = aktif jika bukan localhost / file://. */
export function isProxy() {
  const { USE_PROXY } = getConfig();
  if (USE_PROXY === 'auto') {
    const h = location.hostname;
    return !(location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '');
  }
  return !!USE_PROXY;
}

/** Cek apakah suatu jenis data harus memakai data demo (key belum diisi). */
export function isDemo(kind) {
  const c = getConfig();
  if (!c.DEMO_IF_NO_KEYS || isProxy()) return false;
  const k = c.API_KEYS;
  if (kind === 'price') return !(hasKey(k.TWELVEDATA) || hasKey(k.FCS));
  if (kind === 'news') return !(hasKey(k.MARKETAUX) || hasKey(k.NEWSAPI));
  return false;
}

const KEY_PARAM = { twelvedata: 'apikey', fcs: 'access_key', marketaux: 'api_token', newsapi: 'apiKey' };

/** Bangun URL: langsung ke provider, atau lewat Netlify Function. */
function buildUrl(provider, path, params) {
  const c = getConfig();
  const q = new URLSearchParams(params);
  if (isProxy()) {
    q.set('provider', provider);
    q.set('path', path);
    return `${c.PROXY_URL}?${q}`;
  }
  const base = c.ENDPOINTS[provider.toUpperCase()];
  q.set(KEY_PARAM[provider], c.API_KEYS[provider.toUpperCase()]);
  return `${base}${path}?${q}`;
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch { /* abaikan */ }
      throw new Error(`HTTP ${res.status} ${detail}`.trim());
    }
    return await res.json();
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------
// HARGA
// ---------------------------------------------------------------
function parseDatetime(s) {
  const iso = s.length === 10 ? `${s}T00:00:00Z` : `${s.replace(' ', 'T')}Z`;
  return Math.floor(Date.parse(iso) / 1000);
}

async function fetchTwelveData(tf) {
  const c = getConfig();
  if (!isProxy() && !hasKey(c.API_KEYS.TWELVEDATA)) throw new Error('API key TwelveData belum diisi');
  if (usageGet('twelvedata', 'day') >= c.LIMITS.TWELVEDATA_PER_DAY) throw new Error('Kuota harian TwelveData habis');
  usageInc('twelvedata', 'day');
  const url = buildUrl('twelvedata', '/time_series', {
    symbol: c.SYMBOL, interval: tf, outputsize: 300, order: 'asc', timezone: 'UTC',
  });
  const json = await fetchJson(url);
  if (json.status === 'error' || !Array.isArray(json.values)) {
    throw new Error(`TwelveData: ${json.message || 'respons tidak valid'}`);
  }
  const candles = json.values.map((v) => ({
    time: parseDatetime(v.datetime),
    open: +v.open, high: +v.high, low: +v.low, close: +v.close,
    volume: v.volume ? +v.volume : 0,
  })).filter((x) => Number.isFinite(x.time) && Number.isFinite(x.close));
  if (!candles.length) throw new Error('TwelveData: data kosong');
  return candles;
}

/** FCS hanya memberi harga terakhir -> dipakai untuk memperbarui candle cache. */
async function fetchFcs(tf) {
  const c = getConfig();
  if (!isProxy() && !hasKey(c.API_KEYS.FCS)) throw new Error('API key FCS belum diisi');
  if (usageGet('fcs', 'month') >= c.LIMITS.FCS_PER_MONTH) throw new Error('Kuota bulanan FCS habis');
  const old = cacheGet(`price:${tf}`, Infinity);
  if (!old?.data?.candles?.length) throw new Error('FCS hanya memberi harga terakhir; belum ada data candle di cache');
  usageInc('fcs', 'month');
  const json = await fetchJson(buildUrl('fcs', '/forex/latest', { symbol: c.SYMBOL }));
  const row = json?.response?.[0];
  const price = row ? parseFloat(row.c ?? row.price) : NaN;
  if (!Number.isFinite(price)) throw new Error('FCS: respons tidak valid');

  const candles = old.data.candles.map((x) => ({ ...x }));
  const step = tfSeconds(tf);
  const start = Math.floor(Date.now() / 1000 / step) * step;
  let last = candles[candles.length - 1];
  if (last.time < start) {
    candles.push({ time: start, open: last.close, high: price, low: price, close: price, volume: 0 });
  } else {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
  }
  return candles;
}

/**
 * Ambil candle harga.
 * @returns {{candles, source, ts, stale, demo, note}}
 */
export async function getPrice(tf, { force = false } = {}) {
  const c = getConfig();
  const key = `price:${tf}`;
  const cached = cacheGet(key, c.CACHE_TTL.PRICE);
  if (!force && cached?.fresh) {
    console.log(`[api] harga ${tf} dari cache (${Math.round(cached.age / 1000)}s)`);
    return { ...cached.data, ts: cached.ts, cached: true };
  }

  if (isDemo('price')) {
    const res = { candles: demoCandles(tf), source: 'DEMO', demo: true };
    cacheSet(key, res);
    return { ...res, ts: Date.now() };
  }

  const providers = [['TwelveData', fetchTwelveData], ['FCS', fetchFcs]];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const candles = await fn(tf);
      const res = { candles, source: name, note: name === 'FCS' ? 'Fallback FCS: hanya harga terakhir yang diperbarui' : '' };
      cacheSet(key, res);
      console.log(`[api] harga ${tf} dari ${name} (${candles.length} candle)`);
      return { ...res, ts: Date.now() };
    } catch (e) {
      console.warn(`[api] ${name} gagal:`, e.message);
      errors.push(`${name}: ${e.message}`);
    }
  }
  if (cached) return { ...cached.data, ts: cached.ts, stale: true, note: `Data lama - ${errors.join(' | ')}` };
  throw new Error(errors.join(' | '));
}

// ---------------------------------------------------------------
// BERITA
// ---------------------------------------------------------------
async function fetchMarketaux() {
  const c = getConfig();
  if (!isProxy() && !hasKey(c.API_KEYS.MARKETAUX)) throw new Error('API key Marketaux belum diisi');
  if (usageGet('marketaux', 'day') >= c.LIMITS.MARKETAUX_PER_DAY) throw new Error('Kuota harian Marketaux habis');
  usageInc('marketaux', 'day');
  const json = await fetchJson(buildUrl('marketaux', '/v1/news/all', {
    symbols: c.NEWS_SYMBOL, filter_entities: 'true', language: 'en', limit: 10,
  }));
  if (!Array.isArray(json.data)) throw new Error(`Marketaux: ${json.error?.message || 'respons tidak valid'}`);
  return json.data.map((a) => ({
    title: a.title, description: a.description || a.snippet || '', url: a.url,
    image: a.image_url || '', source: a.source || 'Marketaux', publishedAt: a.published_at,
  }));
}

async function fetchNewsApi() {
  const c = getConfig();
  if (!isProxy() && !hasKey(c.API_KEYS.NEWSAPI)) throw new Error('API key NewsAPI belum diisi');
  if (usageGet('newsapi', 'day') >= c.LIMITS.NEWSAPI_PER_DAY) throw new Error('Kuota harian NewsAPI habis');
  usageInc('newsapi', 'day');
  const json = await fetchJson(buildUrl('newsapi', '/v2/everything', {
    q: 'gold price forex', sortBy: 'publishedAt', language: 'en', pageSize: 10,
  }));
  if (json.status !== 'ok') throw new Error(`NewsAPI: ${json.message || 'respons tidak valid'}`);
  return json.articles.map((a) => ({
    title: a.title, description: a.description || '', url: a.url,
    image: a.urlToImage || '', source: a.source?.name || 'NewsAPI', publishedAt: a.publishedAt,
  }));
}

/** Gabungkan hasil, buang duplikat judul, urutkan terbaru, ambil 10. */
function mergeNews(lists) {
  const seen = new Set();
  return lists.flat()
    .filter((n) => n.title && n.title !== '[Removed]')
    .filter((n) => { const k = n.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 10);
}

export async function getNews({ force = false } = {}) {
  const c = getConfig();
  const cached = cacheGet('news', c.CACHE_TTL.NEWS);
  if (!force && cached?.fresh) return { ...cached.data, ts: cached.ts, cached: true };

  if (isDemo('news')) {
    const res = { items: demoNews(), source: 'DEMO', demo: true };
    cacheSet('news', res);
    return { ...res, ts: Date.now() };
  }

  const used = []; const lists = []; const errors = [];
  // Marketaux free tier hanya mengembalikan sedikit artikel per request,
  // jadi NewsAPI dipakai untuk melengkapi sampai 10 berita.
  for (const [name, fn] of [['Marketaux', fetchMarketaux], ['NewsAPI', fetchNewsApi]]) {
    if (lists.flat().length >= 10) break;
    try { lists.push(await fn()); used.push(name); }
    catch (e) { console.warn(`[api] ${name} gagal:`, e.message); errors.push(`${name}: ${e.message}`); }
  }
  const items = mergeNews(lists);
  if (items.length) {
    const res = { items, source: used.join(' + ') };
    cacheSet('news', res);
    return { ...res, ts: Date.now() };
  }
  if (cached) return { ...cached.data, ts: cached.ts, stale: true, note: errors.join(' | ') };
  throw new Error(errors.join(' | '));
}

// ---------------------------------------------------------------
// KALENDER EKONOMI
// ---------------------------------------------------------------
const toImpact = (v) => {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('high') || s === '3' || s.includes('tinggi')) return 'High';
  if (s.includes('med') || s === '2' || s.includes('sedang')) return 'Medium';
  return 'Low';
};

function toDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalisasi berbagai format JSON kalender ke satu bentuk. */
function normalizeCalendar(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.events || raw?.results || raw?.calendar || []);
  return arr.map((e) => {
    const t = toDate(e.date ?? e.datetime ?? e.time ?? e.timestamp);
    return t && {
      time: t.toISOString(),
      country: String(e.country ?? e.currency ?? e.region ?? '').toUpperCase(),
      event: e.title ?? e.event ?? e.name ?? '',
      impact: toImpact(e.impact ?? e.importance ?? e.volatility),
      forecast: e.forecast ?? e.consensus ?? '',
      previous: e.previous ?? '',
      actual: e.actual ?? '',
    };
  }).filter((e) => e && e.event);
}

export async function getCalendar({ force = false } = {}) {
  const c = getConfig();
  const cached = cacheGet('calendar', c.CACHE_TTL.CALENDAR);
  if (!force && cached?.fresh) return { ...cached.data, ts: cached.ts, cached: true };

  const errors = [];
  const sources = c.ENDPOINTS.CALENDAR;
  for (let i = 0; i < sources.length; i++) {
    try {
      const url = isProxy()
        ? `${c.PROXY_URL}?${new URLSearchParams({ provider: 'calendar', source: i })}`
        : sources[i];
      const items = normalizeCalendar(await fetchJson(url));
      if (!items.length) throw new Error('data kosong');
      const res = { items, source: new URL(sources[i]).hostname };
      cacheSet('calendar', res);
      console.log(`[api] kalender dari ${res.source} (${items.length} event)`);
      return { ...res, ts: Date.now() };
    } catch (e) {
      console.warn(`[api] kalender sumber ${i} gagal:`, e.message);
      errors.push(`${new URL(sources[i]).hostname}: ${e.message}`);
    }
  }
  if (cached) return { ...cached.data, ts: cached.ts, stale: true, note: errors.join(' | ') };
  if (c.DEMO_IF_NO_KEYS && !isProxy()) {
    return { items: demoCalendar(), source: 'DEMO', demo: true, ts: Date.now(), note: errors.join(' | ') };
  }
  throw new Error(errors.join(' | '));
}
