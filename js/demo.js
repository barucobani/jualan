// ============================================================
// Data DEMO - dipakai jika API key belum diisi, supaya UI bisa dicoba.
// Harga di sini FIKTIF, bukan harga pasar.
// ============================================================

const TF_SECONDS = { '1min': 60, '5min': 300, '15min': 900, '1h': 3600, '4h': 14400, '1day': 86400 };
export const tfSeconds = (tf) => TF_SECONDS[tf] || 900;

/** Random walk deterministik sederhana (seed) agar chart stabil saat refresh. */
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function demoCandles(tf, count = 300) {
  const step = tfSeconds(tf);
  const now = Math.floor(Date.now() / 1000);
  const end = now - (now % step);
  const rand = rng(42 + step);
  let price = 2650;
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const time = end - i * step;
    const vol = 1.2 * Math.sqrt(step / 60);
    const drift = Math.sin(i / 25) * vol * 0.4;
    const open = price;
    const close = open + drift + (rand() - 0.5) * vol * 2;
    const high = Math.max(open, close) + rand() * vol;
    const low = Math.min(open, close) - rand() * vol;
    out.push({
      time, open: +open.toFixed(2), high: +high.toFixed(2),
      low: +low.toFixed(2), close: +close.toFixed(2),
      volume: Math.round(500 + rand() * 1500),
    });
    price = close;
  }
  // Gerakkan candle terakhir sedikit tiap panggilan agar terlihat "live"
  const last = out[out.length - 1];
  last.close = +(last.close + (Math.random() - 0.5) * 0.6).toFixed(2);
  last.high = Math.max(last.high, last.close);
  last.low = Math.min(last.low, last.close);
  return out;
}

export function demoNews() {
  const now = Date.now();
  const mk = (mins, title, source, desc) => ({
    title, source, description: desc, url: '#',
    image: '', publishedAt: new Date(now - mins * 60000).toISOString(),
  });
  return [
    mk(12, 'Gold rally extends as safe haven demand surges', 'DEMO Wire', 'Investors flock to bullion amid uncertainty.'),
    mk(35, 'Dollar strengthens ahead of Fed remarks, gold slips', 'DEMO Markets', 'Yields edge higher.'),
    mk(70, 'Analysts see gold uptrend intact despite brief drop', 'DEMO Daily', 'Bullish outlook maintained.'),
    mk(120, 'Central banks continue gold buying spree', 'DEMO Commodities', 'Reserves gain for another quarter.'),
    mk(180, 'Gold steadies after sell-off as traders weigh data', 'DEMO Wire', 'Range-bound trading expected.'),
  ];
}

export function demoCalendar() {
  // Waktu relatif terhadap sekarang agar selalu jatuh di "hari ini" / "besok"
  const t = (hours) => new Date(Date.now() + hours * 3600e3).toISOString();
  return [
    { time: t(-1), country: 'USD', event: 'Core CPI m/m (DEMO)', impact: 'High', forecast: '0.3%', previous: '0.3%', actual: '0.4%' },
    { time: t(1), country: 'USD', event: 'FOMC Member Speaks (DEMO)', impact: 'Medium', forecast: '', previous: '', actual: '' },
    { time: t(3), country: 'EUR', event: 'German Ifo Business Climate (DEMO)', impact: 'Low', forecast: '87.0', previous: '86.8', actual: '' },
    { time: t(20), country: 'USD', event: 'Non-Farm Payrolls (DEMO)', impact: 'High', forecast: '175K', previous: '158K', actual: '' },
  ];
}
