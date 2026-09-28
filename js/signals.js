// ============================================================
// Logika sinyal gabungan (scoring berbobot, total 100 poin)
//   Teknikal 40 | Sentimen berita 30 | Kalender 20 | Price action 10
// Setiap komponen menghasilkan poin BUY dan poin SELL.
// Net = BUY - SELL (rentang -100..+100) -> arah + confidence.
// ============================================================
import { clamp } from './utils.js';

const CAP = { tech: 40, news: 30, calendar: 20, pa: 10 };

/** A. Indikator teknis (maks 40 poin per sisi). */
function scoreTechnical(s) {
  let buy = 0; let sell = 0; const reasons = [];
  // RSI
  if (s.rsi !== null) {
    if (s.rsi < 30) { buy += 15; reasons.push(`RSI (14) = ${s.rsi.toFixed(1)} → Oversold, potensi rebound`); }
    else if (s.rsi < 45) { buy += 8; reasons.push(`RSI (14) = ${s.rsi.toFixed(1)} → Condong lemah (peluang rebound)`); }
    else if (s.rsi > 70) { sell += 15; reasons.push(`RSI (14) = ${s.rsi.toFixed(1)} → Overbought, potensi koreksi`); }
    else if (s.rsi > 55) { sell += 8; reasons.push(`RSI (14) = ${s.rsi.toFixed(1)} → Condong jenuh beli`); }
  }
  // MACD
  if (s.macdCross === 'bull') { buy += 10; reasons.push('MACD cross di atas signal → Bullish'); }
  else if (s.macdCross === 'bear') { sell += 10; reasons.push('MACD cross di bawah signal → Bearish'); }
  if (s.hist !== null && s.histPrev !== null) {
    if (s.hist > s.histPrev) { buy += 5; } else if (s.hist < s.histPrev) { sell += 5; }
  }
  // EMA
  if (s.emaAlign === 'bull') { buy += 10; reasons.push('EMA 20 > 50 > 200 → Tren naik'); }
  else if (s.emaAlign === 'bear') { sell += 10; reasons.push('EMA 20 < 50 < 200 → Tren turun'); }
  // Bollinger
  if (s.bbLower !== null && s.price <= s.bbLower) { buy += 5; reasons.push('Harga menyentuh lower Bollinger Band'); }
  if (s.bbUpper !== null && s.price >= s.bbUpper) { sell += 5; reasons.push('Harga menyentuh upper Bollinger Band'); }
  return { buy: Math.min(buy, CAP.tech), sell: Math.min(sell, CAP.tech), reasons };
}

/** B. Sentimen berita (skor 0-100 dari news.js). */
function scoreNews(sentiment) {
  if (!sentiment || sentiment.score === null) return { buy: 0, sell: 0, reasons: [] };
  const sc = sentiment.score; let buy = 0; let sell = 0;
  if (sc <= 30) sell = 30; else if (sc <= 45) sell = 15;
  else if (sc >= 71) buy = 30; else if (sc >= 56) buy = 15;
  const label = sc >= 71 ? 'Bullish kuat' : sc >= 56 ? 'Bullish' : sc > 45 ? 'Netral' : sc > 30 ? 'Bearish' : 'Bearish kuat';
  return { buy, sell, reasons: [`Sentimen berita ${sc}/100 → ${label}`] };
}

/** Kebalikan: untuk data ini angka lebih tinggi = USD kuat = bearish emas. */
const INVERSE = /unemployment|jobless|claims/i;
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * C. Kalender ekonomi (maks 20 poin) + penalti confidence jika event High-impact < 2 jam.
 * Catatan arah: data USD yang LEBIH KUAT dari forecast (NFP/CPI naik) cenderung menguatkan
 * dolar & yield -> BEARISH untuk emas. Data lebih lemah -> bullish. (Berbeda dari draft awal.)
 */
function scoreCalendar(events, now = Date.now()) {
  let buy = 0; let sell = 0; const reasons = []; const warnings = []; let penalty = 0;
  const usd = (events || []).filter((e) => e.country === 'USD');

  const upcoming = (events || [])
    .filter((e) => e.impact === 'High')
    .map((e) => ({ e, dt: new Date(e.time).getTime() - now }))
    .filter((x) => x.dt > 0 && x.dt <= 2 * 3600e3)
    .sort((a, b) => a.dt - b.dt);
  if (upcoming.length) {
    penalty = 20;
    const m = Math.round(upcoming[0].dt / 60000);
    warnings.push(`Event High-impact "${upcoming[0].e.event}" (${upcoming[0].e.country}) dalam ${m} menit, volatilitas tinggi`);
    reasons.push('Ada event High-impact dalam 2 jam → confidence dikurangi 20 poin');
  }

  // Rilis USD dalam 3 jam terakhir yang punya actual & forecast
  for (const e of usd) {
    const ago = now - new Date(e.time).getTime();
    if (e.impact === 'Low' || ago < 0 || ago > 3 * 3600e3) continue;
    const a = num(e.actual); const f = num(e.forecast);
    if (a === null || f === null || a === f) continue;
    const stronger = INVERSE.test(e.event) ? a < f : a > f; // "kuat" untuk ekonomi AS
    if (stronger) { sell += 10; reasons.push(`${e.event}: actual ${e.actual} vs forecast ${e.forecast} → USD kuat, bearish emas`); }
    else { buy += 10; reasons.push(`${e.event}: actual ${e.actual} vs forecast ${e.forecast} → USD lemah, bullish emas`); }
    break; // satu rilis paling relevan cukup
  }

  if (!upcoming.length && !buy && !sell) reasons.push('Tidak ada event High-impact dalam 2 jam ke depan');
  return { buy: Math.min(buy, CAP.calendar), sell: Math.min(sell, CAP.calendar), reasons, warnings, penalty };
}

/** D. Price action: posisi terhadap VWAP + struktur swing. */
function scorePriceAction(s) {
  let buy = 0; let sell = 0; const reasons = [];
  if (s.vwap !== null) {
    if (s.price > s.vwap) { buy += 5; reasons.push('Harga di atas VWAP'); }
    else if (s.price < s.vwap) { sell += 5; reasons.push('Harga di bawah VWAP'); }
  }
  if (s.structure === 'HH_HL') { buy += 5; reasons.push('Struktur higher high + higher low'); }
  else if (s.structure === 'LH_LL') { sell += 5; reasons.push('Struktur lower high + lower low'); }
  return { buy: Math.min(buy, CAP.pa), sell: Math.min(sell, CAP.pa), reasons };
}

/**
 * Hitung sinyal gabungan.
 * @returns {{direction, label, confidence, net, buy, sell, parts, reasons, warnings}}
 */
export function computeSignal({ snap, sentiment, events, now = Date.now() }) {
  const parts = {
    tech: scoreTechnical(snap),
    news: scoreNews(sentiment),
    calendar: scoreCalendar(events, now),
    pa: scorePriceAction(snap),
  };
  const buy = Object.values(parts).reduce((a, p) => a + p.buy, 0);
  const sell = Object.values(parts).reduce((a, p) => a + p.sell, 0);
  const net = buy - sell;
  const abs = Math.abs(net);

  let label = 'NEUTRAL'; let direction = 'NEUTRAL'; let confidence;
  if (abs >= 60) { label = net > 0 ? 'STRONG BUY' : 'STRONG SELL'; confidence = 85 + ((Math.min(abs, 100) - 60) / 40) * 15; }
  else if (abs >= 30) { label = net > 0 ? 'BUY' : 'SELL'; confidence = 65 + ((abs - 30) / 30) * 20; }
  else { confidence = 30 + (abs / 30) * 30; }   // netral: 30-60% = keyakinan rendah
  if (label !== 'NEUTRAL') direction = net > 0 ? 'BUY' : 'SELL';

  confidence = Math.round(clamp(confidence - parts.calendar.penalty, 0, 100));
  // Jika penalti menurunkan confidence di bawah 65, sinyal tidak lagi layak
  const downgraded = direction !== 'NEUTRAL' && confidence < 65;
  const warnings = [...parts.calendar.warnings];
  if (downgraded) warnings.push('Confidence turun di bawah 65% karena event mendatang');

  const reasons = [
    ...parts.tech.reasons, ...parts.news.reasons,
    ...parts.calendar.reasons, ...parts.pa.reasons,
  ];
  return { direction, label, confidence, net, buy, sell, parts, reasons, warnings, downgraded };
}
