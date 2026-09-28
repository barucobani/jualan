// ============================================================
// Kalkulasi Entry, Stop Loss, dan Take Profit (berbasis ATR + S/R)
// ============================================================
import { round2, clamp } from './utils.js';

const TP_MULT = [1, 2, 3];          // kelipatan risk -> R/R 1:1, 1:2, 1:3
const TP_SHARE = [40, 35, 25];      // persentase posisi yang ditutup

/**
 * @param {'BUY'|'SELL'} direction
 * @param {object} s snapshot indikator (price, atr, rsi, macd, macdSignal, support, resistance)
 */
export function calcLevels(direction, s) {
  const isBuy = direction === 'BUY';
  const dir = isBuy ? 1 : -1;
  const { price, atr, support, resistance } = s;
  const warnings = [];

  // ---------- ENTRY ----------
  let entry = price; let orderType = 'MARKET'; let scenario = 'Momentum / harga pasar';
  const strongMomentum = isBuy
    ? s.rsi > 60 && s.macd > s.macdSignal
    : s.rsi < 40 && s.macd < s.macdSignal;

  if (!strongMomentum) {
    if (isBuy) {
      const nearSupport = support !== null && price - support <= 2 * atr;
      const broke = s.brokenResistance != null;
      if (nearSupport) {
        const e = support + 0.5 * atr;
        if (e < price) { entry = e; orderType = 'LIMIT'; scenario = 'Pullback ke support'; }
      } else if (broke) {
        entry = s.brokenResistance + 0.2 * atr;
        orderType = entry > price ? 'STOP' : 'LIMIT';
        scenario = 'Retest resistance yang baru ditembus';
      }
    } else {
      const nearRes = resistance !== null && resistance - price <= 2 * atr;
      if (nearRes) {
        const e = resistance - 0.5 * atr;
        if (e > price) { entry = e; orderType = 'LIMIT'; scenario = 'Rally ke resistance'; }
      } else if (s.brokenSupport != null) {
        entry = s.brokenSupport - 0.2 * atr;
        orderType = entry < price ? 'STOP' : 'LIMIT';
        scenario = 'Retest support yang baru ditembus';
      }
    }
  }
  entry = round2(entry);

  // ---------- STOP LOSS ----------
  let sl = entry - dir * 1.5 * atr;
  const level = isBuy ? support : resistance;
  if (level !== null && (isBuy ? level < entry : level > entry)) {
    const structural = level - dir * 0.3 * atr;   // sedikit di luar S/R
    const dist = Math.abs(entry - structural);
    // Pakai SL struktural hanya jika masih wajar (antara 0.5 dan 2.5 ATR)
    if (dist >= 0.5 * atr && dist <= 2.5 * atr) sl = structural;
  }
  const maxDist = entry * 0.01; const minDist = entry * 0.003;
  let dist = Math.abs(entry - sl);
  if (dist > maxDist) { dist = maxDist; warnings.push('SL dipersempit ke 1% karena volatilitas tinggi'); }
  if (dist < minDist) { dist = minDist; warnings.push('SL dilebarkan ke minimum 0.3% agar tidak terlalu ketat'); }
  sl = round2(entry - dir * dist);
  const risk = round2(Math.abs(entry - sl));

  // ---------- TAKE PROFIT ----------
  const tps = TP_MULT.map((m, i) => ({
    level: i + 1, price: round2(entry + dir * m * risk), percentage: TP_SHARE[i],
  }));
  // Geser TP1 jika melewati S/R kuat terdekat
  const barrier = isBuy ? resistance : support;
  if (barrier !== null && (isBuy ? barrier > entry : barrier < entry)) {
    const beyond = isBuy ? tps[0].price > barrier : tps[0].price < barrier;
    if (beyond) {
      const shifted = round2(barrier - dir * 0.2 * atr);
      const reward = Math.abs(shifted - entry);
      if ((isBuy ? shifted > entry : shifted < entry)) {
        tps[0].price = shifted;
        if (reward < risk) warnings.push('TP1 terlalu dekat (R/R < 1:1), pertimbangkan hold lebih lama');
      } else {
        warnings.push('Resistance/support terlalu dekat dengan entry, TP1 berisiko tidak tercapai');
      }
    }
  }
  tps.forEach((t) => {
    t.diff = round2(Math.abs(t.price - entry));
    t.pct = round2((t.diff / entry) * 100);
    t.rr = round2(t.diff / risk);
  });

  // R/R rata-rata tertimbang berdasarkan porsi posisi
  const weightedRR = round2(tps.reduce((a, t) => a + t.rr * (t.percentage / 100), 0));

  return {
    entry, orderType, scenario, stopLoss: sl,
    slDiff: risk, slPct: round2((risk / entry) * 100),
    takeProfits: tps, riskRewardRatio: weightedRR, warnings,
  };
}

/** Estimasi durasi hold berdasarkan timeframe. */
export function holdEstimate(tf) {
  if (tf === '1min' || tf === '5min') return 'Scalping (5–30 menit)';
  if (tf === '15min' || tf === '1h') return 'Intraday (1–8 jam)';
  return 'Swing (1–5 hari)';
}
export const _clamp = clamp;
