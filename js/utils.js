// ============================================================
// Utilitas umum: cache localStorage, counter kuota, format angka/waktu
// ============================================================

const PREFIX = 'xau:';
const hasLS = typeof localStorage !== 'undefined';

/** Baca item dari localStorage (JSON). */
export function lsGet(key, fallback = null) {
  if (!hasLS) return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

/** Tulis item ke localStorage (JSON). */
export function lsSet(key, value) {
  if (!hasLS) return;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
  catch (e) { console.warn('[utils] localStorage penuh/tidak tersedia', e); }
}

/** Ambil data cache. Return { data, age, fresh } atau null. */
export function cacheGet(key, ttl) {
  const item = lsGet('cache:' + key);
  if (!item) return null;
  const age = Date.now() - item.ts;
  return { data: item.data, age, ts: item.ts, fresh: age < ttl };
}

export function cacheSet(key, data) {
  lsSet('cache:' + key, { ts: Date.now(), data });
}

/** Counter kuota API per periode ('day' | 'month'). */
export function usageKey(name, period) {
  const d = new Date();
  const stamp = period === 'month'
    ? `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`
    : `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  return `usage:${name}:${stamp}`;
}
export function usageGet(name, period) { return lsGet(usageKey(name, period), 0); }
export function usageInc(name, period) { lsSet(usageKey(name, period), usageGet(name, period) + 1); }

/** Format angka: ribuan koma, desimal titik. */
export function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtSigned(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return (n >= 0 ? '+' : '-') + fmt(Math.abs(n), digits);
}

export function fmtTime(date, tz, withSeconds = false) {
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz };
  if (withSeconds) opts.second = '2-digit';
  return new Date(date).toLocaleTimeString('id-ID', opts).replace(/\./g, ':');
}

export function fmtDateTime(date, tz) {
  return new Date(date).toLocaleString('id-ID', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz,
  }).replace(/\./g, ':').replace(',', '');
}

/** Waktu relatif singkat: "5 mnt lalu". */
export function timeAgo(date) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round2 = (v) => Math.round(v * 100) / 100;

/** Escape HTML agar teks dari API aman dimasukkan ke innerHTML. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Hanya izinkan link http(s). */
export function safeUrl(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; }
  catch { return '#'; }
}

// ---------- Konfigurasi global (diisi oleh app.js setelah config dimuat) ----------
let _cfg = null;
export const setConfig = (c) => { _cfg = c; };
export const getConfig = () => _cfg;
