// ============================================================
// Perhitungan indikator teknis (tanpa library eksternal)
// Semua fungsi mengembalikan array sepanjang input; nilai yang belum
// bisa dihitung diisi null.
// ============================================================

const valid = (v) => v !== null && v !== undefined && !Number.isNaN(v);
export const last = (arr, n = 1) => arr[arr.length - n];

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0; let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      if (!valid(values[j])) { ok = false; break; }
      sum += values[j];
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

/** EMA dengan seed SMA dari `period` nilai valid pertama. */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null; let sum = 0; let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!valid(v)) continue;
    if (prev === null) {
      sum += v; count++;
      if (count === period) { prev = sum / period; out[i] = prev; }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** RSI metode Wilder. */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0; let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    gain += Math.max(d, 0); loss += Math.max(-d, 0);
  }
  let avgG = gain / period; let avgL = loss / period;
  const calc = () => (avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  out[period] = calc();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signalP = 9) {
  const ef = ema(closes, fast); const es = ema(closes, slow);
  const line = closes.map((_, i) => (valid(ef[i]) && valid(es[i]) ? ef[i] - es[i] : null));
  const signal = ema(line, signalP);
  const hist = line.map((v, i) => (valid(v) && valid(signal[i]) ? v - signal[i] : null));
  return { line, signal, hist };
}

export function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd; lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

/** ATR metode Wilder. */
export function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  let a = 0;
  for (let i = 1; i <= period; i++) a += tr[i];
  a /= period; out[period] = a;
  for (let i = period + 1; i < candles.length; i++) {
    a = (a * (period - 1) + tr[i]) / period; out[i] = a;
  }
  return out;
}

/** Stochastic (14,3,3): %K diperhalus SMA(3), %D = SMA(3) dari %K. */
export function stochastic(candles, kP = 14, kSmooth = 3, dP = 3) {
  const raw = candles.map((c, i) => {
    if (i < kP - 1) return null;
    let hh = -Infinity; let ll = Infinity;
    for (let j = i - kP + 1; j <= i; j++) { hh = Math.max(hh, candles[j].high); ll = Math.min(ll, candles[j].low); }
    return hh === ll ? 50 : ((c.close - ll) / (hh - ll)) * 100;
  });
  const k = sma(raw, kSmooth);
  const d = sma(k, dP);
  return { k, d };
}

/** VWAP per hari (UTC). Jika volume tidak ada (forex), semua candle berbobot sama. */
export function vwap(candles) {
  const hasVol = candles.some((c) => c.volume > 0);
  let day = null; let pv = 0; let vv = 0;
  return candles.map((c) => {
    const d = Math.floor(c.time / 86400);
    if (d !== day) { day = d; pv = 0; vv = 0; }
    const w = hasVol ? c.volume : 1;
    pv += ((c.high + c.low + c.close) / 3) * w; vv += w;
    return vv ? pv / vv : null;
  });
}

/** Titik swing high/low (fractal sederhana). */
export function swings(candles, n = 3) {
  const highs = []; const lows = [];
  for (let i = n; i < candles.length - n; i++) {
    let isH = true; let isL = true;
    for (let j = 1; j <= n; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isH = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isL = false;
    }
    if (isH) highs.push({ index: i, price: candles[i].high });
    if (isL) lows.push({ index: i, price: candles[i].low });
  }
  return { highs, lows };
}

/** Support/resistance terdekat dari titik swing 150 candle terakhir. */
export function supportResistance(candles, price) {
  const from = Math.max(0, candles.length - 150);
  const { highs, lows } = swings(candles.slice(from), 3);
  const above = highs.map((h) => h.price).filter((p) => p > price).sort((a, b) => a - b);
  const below = lows.map((l) => l.price).filter((p) => p < price).sort((a, b) => b - a);
  const recent = candles.slice(-50);
  const hi = Math.max(...recent.map((c) => c.high));
  const lo = Math.min(...recent.map((c) => c.low));
  // Resistance yang baru saja ditembus (swing high < harga, terbentuk di 25 candle terakhir)
  const broken = highs.filter((h) => h.price < price && h.index >= candles.slice(from).length - 25)
    .map((h) => h.price).sort((a, b) => b - a)[0] ?? null;
  const brokenSup = lows.filter((l) => l.price > price && l.index >= candles.slice(from).length - 25)
    .map((l) => l.price).sort((a, b) => a - b)[0] ?? null;
  return {
    brokenSupport: brokenSup,
    resistance: above[0] ?? (hi > price ? hi : null),
    support: below[0] ?? (lo < price ? lo : null),
    brokenResistance: broken,
  };
}

/** Cross MACD dalam `lookback` candle terakhir: 'bull' | 'bear' | null. */
function recentMacdCross(m, lookback = 3) {
  const n = m.line.length;
  for (let i = n - 1; i > n - 1 - lookback && i > 0; i--) {
    const a = m.line[i] - m.signal[i]; const b = m.line[i - 1] - m.signal[i - 1];
    if (![a, b].every(valid)) continue;
    if (b <= 0 && a > 0) return 'bull';
    if (b >= 0 && a < 0) return 'bear';
  }
  return null;
}

/**
 * Hitung semua indikator + snapshot nilai terakhir.
 * @param {Array} candles [{time, open, high, low, close, volume}]
 */
export function computeAll(candles) {
  const closes = candles.map((c) => c.close);
  const series = {
    ema20: ema(closes, 20), ema50: ema(closes, 50), ema200: ema(closes, 200),
    rsi: rsi(closes, 14), macd: macd(closes), bb: bollinger(closes, 20, 2),
    atr: atr(candles, 14), stoch: stochastic(candles), vwap: vwap(candles),
  };
  const price = last(closes);
  const sw = swings(candles.slice(-150), 3);
  const [h1, h2] = [last(sw.highs), last(sw.highs, 2)];
  const [l1, l2] = [last(sw.lows), last(sw.lows, 2)];
  let structure = null;
  if (h1 && h2 && l1 && l2) {
    if (h1.price > h2.price && l1.price > l2.price) structure = 'HH_HL';
    else if (h1.price < h2.price && l1.price < l2.price) structure = 'LH_LL';
  }
  const e20 = last(series.ema20); const e50 = last(series.ema50); const e200 = last(series.ema200);
  let emaAlign = null;
  if ([e20, e50, e200].every(valid)) {
    if (e20 > e50 && e50 > e200) emaAlign = 'bull';
    else if (e20 < e50 && e50 < e200) emaAlign = 'bear';
  }
  const snap = {
    price,
    rsi: last(series.rsi),
    macd: last(series.macd.line), macdSignal: last(series.macd.signal),
    hist: last(series.macd.hist), histPrev: last(series.macd.hist, 2),
    macdCross: recentMacdCross(series.macd),
    bbUpper: last(series.bb.upper), bbMid: last(series.bb.mid), bbLower: last(series.bb.lower),
    atr: last(series.atr),
    stochK: last(series.stoch.k), stochD: last(series.stoch.d),
    ema20: e20, ema50: e50, ema200: e200, emaAlign,
    vwap: last(series.vwap),
    structure,
    ...supportResistance(candles, price),
  };
  return { series, snap };
}

/** Terjemahkan snapshot ke daftar status untuk panel indikator. */
export function interpret(s) {
  const st = (bull, bear) => (bull ? 'bull' : bear ? 'bear' : 'neutral');
  const f = (v, d = 2) => (valid(v) ? v.toFixed(d) : '-');
  const rows = [];
  rows.push({
    name: 'RSI (14)', value: f(s.rsi, 1),
    state: st(s.rsi < 30, s.rsi > 70),
    note: s.rsi < 30 ? 'Oversold' : s.rsi > 70 ? 'Overbought' : s.rsi < 45 ? 'Lemah' : s.rsi > 55 ? 'Kuat' : 'Netral',
  });
  rows.push({
    name: 'MACD (12,26,9)', value: `${f(s.macd)} / ${f(s.macdSignal)}`,
    state: st(s.macd > s.macdSignal, s.macd < s.macdSignal),
    note: `Hist ${valid(s.hist) ? (s.hist >= 0 ? '+' : '') + s.hist.toFixed(2) : '-'}`,
  });
  rows.push({
    name: 'EMA 20/50/200', value: `${f(s.ema20, 1)} / ${f(s.ema50, 1)} / ${f(s.ema200, 1)}`,
    state: st(s.emaAlign === 'bull', s.emaAlign === 'bear'),
    note: s.emaAlign === 'bull' ? 'Tren naik' : s.emaAlign === 'bear' ? 'Tren turun' : 'Campuran',
  });
  const pos = s.bbUpper && s.bbLower ? (s.price - s.bbLower) / (s.bbUpper - s.bbLower) : null;
  rows.push({
    name: 'Bollinger (20,2)', value: `${f(s.bbLower, 1)} – ${f(s.bbUpper, 1)}`,
    state: st(pos !== null && pos <= 0.05, pos !== null && pos >= 0.95),
    note: pos === null ? '-' : pos <= 0.05 ? 'Di lower band' : pos >= 0.95 ? 'Di upper band' : `Posisi ${(pos * 100).toFixed(0)}%`,
  });
  rows.push({
    name: 'Stochastic (14,3,3)', value: `${f(s.stochK, 1)} / ${f(s.stochD, 1)}`,
    state: st(s.stochK < 20, s.stochK > 80),
    note: s.stochK < 20 ? 'Oversold' : s.stochK > 80 ? 'Overbought' : 'Netral',
  });
  const atrPct = valid(s.atr) ? (s.atr / s.price) * 100 : null;
  rows.push({
    name: 'ATR (14)', value: f(s.atr), state: 'neutral',
    note: atrPct === null ? '-' : `${atrPct.toFixed(2)}% dari harga`,
  });
  return rows;
}
