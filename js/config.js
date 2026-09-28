// ============================================================
// TEMPLATE KONFIGURASI
// Salin file ini menjadi js/config.js lalu isi API key Anda.
// js/config.js sudah masuk .gitignore (tidak ikut ter-push ke GitHub).
// ============================================================

export const CONFIG = {
  // --- API KEY (isi hanya untuk mode direct / lokal) ---
  API_KEYS: {
    TWELVEDATA: 'YOUR_TWELVEDATA_KEY',
    FCS: 'YOUR_FCS_KEY',
    MARKETAUX: 'YOUR_MARKETAUX_KEY',
    NEWSAPI: 'YOUR_NEWSAPI_KEY',
  },

  // --- MODE AKSES API ---
  // 'auto'  : lokal (localhost) = direct pakai key di atas,
  //           domain lain (Netlify) = lewat Netlify Function (key aman di env variable)
  // true    : selalu lewat /.netlify/functions/proxy
  // false   : selalu direct dari browser (key terlihat publik!)
  USE_PROXY: 'auto',

  // --- ENDPOINT ---
  ENDPOINTS: {
    TWELVEDATA: 'https://api.twelvedata.com',
    FCS: 'https://fcsapi.com/api',
    MARKETAUX: 'https://api.marketaux.com',
    NEWSAPI: 'https://newsapi.org',
    // Sumber kalender dicoba berurutan sampai ada yang berhasil.
    // Endpoint Biquote belum bisa saya verifikasi - cek dokumentasinya.
    CALENDAR: [
      'https://api.biquote.io/v1/calendar',
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    ],
  },
  PROXY_URL: '/.netlify/functions/proxy',

  // --- SIMBOL ---
  SYMBOL: 'XAU/USD',
  NEWS_SYMBOL: 'GC=F',

  // --- INTERVAL REFRESH (ms) ---
  REFRESH: {
    PRICE: 60 * 1000,        // 60 detik
    NEWS: 15 * 60 * 1000,    // 15 menit
    CALENDAR: 60 * 60 * 1000 // 1 jam
  },

  // --- TTL CACHE (ms) ---
  CACHE_TTL: {
    PRICE: 60 * 1000,
    NEWS: 15 * 60 * 1000,
    CALENDAR: 60 * 60 * 1000,
  },

  // --- BATAS HARIAN/BULANAN FREE TIER (dipakai untuk auto-fallback) ---
  LIMITS: {
    TWELVEDATA_PER_DAY: 780,   // batas resmi 800/hari, sisakan margin
    FCS_PER_MONTH: 480,        // batas resmi 500/bulan
    MARKETAUX_PER_DAY: 95,
    NEWSAPI_PER_DAY: 95,
  },

  // --- TRADING ---
  DEFAULT_TIMEFRAME: '15min',
  CONTRACT_SIZE: 100,          // 1 lot standar XAUUSD = 100 oz -> $1 gerak harga = $100/lot
  MIN_LOT: 0.01,
  DEFAULT_ACCOUNT: { capital: 1000, riskPercent: 1 },

  // Zona waktu untuk tampilan jam
  TIMEZONE: 'Asia/Jakarta',
  // Tampilkan data demo jika API key belum diisi
  DEMO_IF_NO_KEYS: true,
};
