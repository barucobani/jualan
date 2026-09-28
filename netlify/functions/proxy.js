// ============================================================
// Netlify Function: proxy API agar API key tersimpan di environment variable
// (tidak terlihat di browser) dan masalah CORS teratasi.
//
// Environment variable yang perlu diset di Netlify:
//   TWELVEDATA_KEY, FCS_KEY, MARKETAUX_KEY, NEWSAPI_KEY
//
// Pemakaian dari frontend:
//   /.netlify/functions/proxy?provider=twelvedata&path=/time_series&symbol=XAU/USD&interval=15min
//   /.netlify/functions/proxy?provider=calendar&source=1
// ============================================================

const PROVIDERS = {
  twelvedata: { base: 'https://api.twelvedata.com', keyParam: 'apikey', env: 'TWELVEDATA_KEY', paths: ['/time_series'], cache: 30 },
  fcs: { base: 'https://fcsapi.com/api', keyParam: 'access_key', env: 'FCS_KEY', paths: ['/forex/latest'], cache: 30 },
  marketaux: { base: 'https://api.marketaux.com', keyParam: 'api_token', env: 'MARKETAUX_KEY', paths: ['/v1/news/all'], cache: 300 },
  newsapi: { base: 'https://newsapi.org', keyParam: 'apiKey', env: 'NEWSAPI_KEY', paths: ['/v2/everything'], cache: 300 },
};

// Harus sama urutannya dengan CONFIG.ENDPOINTS.CALENDAR di js/config.example.js
const CALENDAR_SOURCES = [
  'https://api.biquote.io/v1/calendar',
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
];

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const q = { ...event.queryStringParameters };
  const { provider } = q;
  let target;
  let cache = 300;

  if (provider === 'calendar') {
    const url = CALENDAR_SOURCES[parseInt(q.source, 10)];
    if (!url) return json(400, { error: 'Sumber kalender tidak dikenal' });
    target = new URL(url);
    cache = 600;
  } else {
    const p = PROVIDERS[provider];
    if (!p) return json(400, { error: 'Provider tidak dikenal' });
    if (!p.paths.includes(q.path)) return json(400, { error: 'Path tidak diizinkan' });
    const key = process.env[p.env];
    if (!key) return json(500, { error: `Environment variable ${p.env} belum diset di Netlify` });

    target = new URL(p.base + q.path);
    for (const [k, v] of Object.entries(q)) {
      if (['provider', 'path', 'source'].includes(k) || k === p.keyParam) continue; // jangan teruskan key dari klien
      target.searchParams.set(k, v);
    }
    target.searchParams.set(p.keyParam, key);
    cache = p.cache;
  }

  try {
    const res = await fetch(target, { headers: { Accept: 'application/json', 'User-Agent': 'xauusd-dashboard/1.0' } });
    const text = await res.text();
    return json(res.status, text, { 'Cache-Control': `public, max-age=${cache}` });
  } catch (err) {
    console.error('[proxy] gagal:', provider, err.message);
    return json(502, { error: `Gagal menghubungi ${provider}: ${err.message}` });
  }
};
