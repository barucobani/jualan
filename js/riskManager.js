// ============================================================
// Manajemen risiko & ukuran posisi untuk XAUUSD
// 1 lot standar = 100 oz  ->  pergerakan $1 = $100 per 1.00 lot = $1 per 0.01 lot
// "Pip" di dashboard ini didefinisikan 1 pip = $0.01 (sesuai spesifikasi awal).
// Catatan: sebagian broker menyebut $0.10 sebagai 1 pip emas, cek broker Anda.
// ============================================================
import { round2 } from './utils.js';

export const PIP = 0.01;
export const toPips = (priceDiff) => Math.round(Math.abs(priceDiff) / PIP);

/**
 * Hitung ukuran lot.
 * lot = risikoUSD / (jarakSL_dalam_$ * contractSize)
 * Dibulatkan KE BAWAH ke kelipatan minLot. Jika hasilnya < minLot,
 * dipakai minLot dengan peringatan bahwa risiko riil melebihi target.
 */
export function positionSize({ capital, riskPercent, entry, stopLoss, contractSize = 100, minLot = 0.01 }) {
  const riskTarget = capital * (riskPercent / 100);
  const slDistance = Math.abs(entry - stopLoss);
  const warnings = [];
  if (!slDistance) return { lot: 0, riskTarget, riskActual: 0, slDistance, warnings: ['Jarak SL nol'] };

  const rawLot = riskTarget / (slDistance * contractSize);
  let lot = Math.floor(rawLot / minLot + 1e-9) * minLot;
  if (lot < minLot) {
    lot = minLot;
    warnings.push(`Lot minimum ${minLot} membuat risiko riil ($${round2(minLot * slDistance * contractSize)}) lebih besar dari target ($${round2(riskTarget)}). Perbesar modal atau lewati trade ini.`);
  }
  lot = round2(lot);
  const riskActual = round2(lot * slDistance * contractSize);
  return { lot, rawLot, riskTarget: round2(riskTarget), riskActual, slDistance, warnings };
}

/** Profit/loss dalam USD untuk selisih harga tertentu. */
export const pnl = (lot, priceDiff, contractSize = 100) => round2(lot * priceDiff * contractSize);
