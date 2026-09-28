# XAUUSD Trading Dashboard

Dashboard XAU/USD berbasis HTML/CSS/JavaScript murni (tanpa framework, tanpa build step): chart candlestick, indikator teknis, berita + sentimen, kalender ekonomi, dan rekomendasi trade (entry, stop loss, take profit, ukuran lot).

> **Hanya untuk edukasi.** Bukan nasihat keuangan. Trading XAUUSD berisiko tinggi. Rekomendasi dihasilkan rumus sederhana dan **belum dibuktikan menguntungkan**. Uji di akun demo dan catat hasilnya sebelum memakai uang sungguhan.

---

## Tampilan

```
┌──────────────────────────────────────────────────────────────────────┐
│ Au XAU/USD   2,654.30 +5.20 (+0.20%)  H 2,660 · L 2,641   [BUY 78%] [↻]│  header (sticky)
├──────────────────────────────────────────────────────────────────────┤
│ 🟢 REKOMENDASI: BUY      Confidence 78%   Timeframe 15M               │
│    [📋 Copy Trade Setup] [🔔 Set Alert] [Refresh Analysis]            │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                                       │
│ Entry MARKET  2,654.30                                                │  panel rekomendasi
│ Stop Loss     2,647.80   -6.50 / -0.24% / 650 pips                    │  (border hijau/merah/abu)
│ TP1 / TP2 / TP3  ...      R/R · lot · risiko · estimasi hold          │
│ • RSI 28.5 oversold  • EMA bullish  • Sentimen 72  • Tak ada event    │
│ Modal [1000] Risiko [1]%     ⚠️ disclaimer                            │
├───────────────────────────────────────┬──────────────────────────────┤
│ Chart  [1M 5M 15M 1H 4H 1D] ☑EMA ☐BB   │ Berita & sentimen  (0-100)   │
│ ┌───────────────────────────────────┐ │ ▬▬▬▬▬▬▬●▬▬▬  10 berita       │
│ │ candlestick + EMA 20/50/200       │ │──────────────────────────────│
│ │ volume di bawah                   │ │ Kalender ekonomi             │
│ └───────────────────────────────────┘ │ [High][Medium][Low] ☐USD     │
│ Indikator: RSI · MACD · EMA · BB ·    │ Hari ini / Besok             │
│            Stochastic · ATR           │ F / P / A per event          │
├───────────────────────────────────────┴──────────────────────────────┤
│ Disclaimer risiko                                                     │
└──────────────────────────────────────────────────────────────────────┘
   (mobile: semua panel ditumpuk vertikal)
```

## Struktur file

```
index.html            halaman utama
css/style.css         tema gelap
js/config.example.js  template konfigurasi (di-commit)
js/config.js          konfigurasi + API key Anda (di-.gitignore)
js/app.js             entry point, orkestrasi, jadwal refresh
js/api.js             fetch harga/berita/kalender, cache, fallback, hitung kuota
js/indicators.js      RSI, MACD, EMA, Bollinger, ATR, Stochastic, VWAP, S/R
js/chart.js           Lightweight Charts (dimuat lazy dari CDN)
js/news.js            feed berita + sentimen keyword
js/calendar.js        kalender ekonomi + filter
js/signals.js         skor gabungan 40/30/20/10
js/tradeLevels.js     entry, stop loss, take profit
js/riskManager.js     ukuran lot & risiko
js/recommendation.js  merangkai rekomendasi, panel, copy, alert, riwayat
js/demo.js            data contoh saat API key belum diisi
js/ui.js, utils.js    helper
netlify/functions/proxy.js   proxy API (menyimpan key di environment variable)
netlify.toml, .gitignore
```

## Arsitektur singkat

```
app.js ─┬─ api.js ──► cache localStorage ──► TwelveData → FCS      (harga)
        │                                  └► Marketaux + NewsAPI  (berita)
        │                                  └► Biquote → ForexFactory JSON (kalender)
        ├─ indicators.js ─► snapshot indikator
        ├─ news.js / calendar.js ─► sentimen 0-100, daftar event
        ├─ signals.js ─► skor BUY/SELL ─► arah + confidence
        ├─ tradeLevels.js + riskManager.js ─► entry/SL/TP/lot
        └─ recommendation.js ─► panel, copy, alert, riwayat
```

Alur data: **cache segar → API utama → API cadangan → cache basi (ditandai) → pesan error**. TTL cache: harga 60 dtk, berita 15 mnt, kalender 1 jam.

## 1. Mendapatkan API key

| Fungsi | Provider | Daftar | Free tier |
|---|---|---|---|
| Harga (utama) | TwelveData | https://twelvedata.com | 800 req/hari, 8/menit |
| Harga (cadangan) | FCS API | https://fcsapi.com | 500 req/bulan |
| Berita (utama) | Marketaux | https://www.marketaux.com | 100 req/hari |
| Berita (cadangan) | NewsAPI | https://newsapi.org | 100 req/hari |
| Kalender | tanpa key | | |

Uji tiap key di browser/Postman sebelum dipakai, misalnya:
`https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=15min&apikey=KEY_ANDA`

## 2. Setup config.js (lokal)

```bash
cp js/config.example.js js/config.js     # sudah ada di paket ini
```
Isi `API_KEYS` di `js/config.js`. `js/config.js` ada di `.gitignore`, jadi tidak ikut ke GitHub. Jika key belum diisi, dashboard berjalan **mode DEMO** (data fiktif, ada banner kuning).

## 3. Test lokal

Aplikasi memakai ES modules, jadi **tidak bisa dibuka lewat `file://`**. Gunakan:
- VS Code → ekstensi **Live Server** → klik kanan `index.html` → *Open with Live Server*, atau
- `python3 -m http.server 8000` lalu buka http://localhost:8000

Di localhost mode default = **direct** (key dipakai langsung dari browser).

## 4. Deploy ke Netlify

> Key di `config.js` yang ikut ter-deploy **terlihat oleh siapa pun** yang membuka situs. Karena itu di domain non-localhost aplikasi otomatis memakai **proxy** (`USE_PROXY: 'auto'`), dan key disimpan di environment variable Netlify.

### A. Lewat GitHub (disarankan)
```bash
git init && git add . && git commit -m "XAUUSD dashboard"
git branch -M main
git remote add origin https://github.com/USERNAME/xauusd-dashboard.git
git push -u origin main
```
1. Netlify → **Add new site → Import an existing project** → pilih repo.
2. Build command kosong, publish directory `.` (sudah diatur `netlify.toml`).
3. **Site configuration → Environment variables**, tambahkan: `TWELVEDATA_KEY`, `FCS_KEY`, `MARKETAUX_KEY`, `NEWSAPI_KEY`.
4. **Deploys → Trigger deploy** agar function membaca variabel tersebut.

### B. Drag & drop
Bisa untuk mencoba, tetapi Netlify Functions tidak selalu ikut ter-deploy lewat drag & drop. Jika data tidak muncul, pakai cara A atau Netlify CLI (`netlify deploy --prod`). Alternatif (kurang aman): set `USE_PROXY: false` dan sertakan `config.js` berisi key. Key jadi publik; jangan lakukan ini dengan key berbayar.

Uji function secara lokal: `npm i -g netlify-cli && netlify dev` (buat file `.env` berisi 4 variabel di atas).

## Cara kerja rekomendasi

**Skor** (masing-masing sisi BUY dan SELL, lalu selisihnya):
Teknikal 40 (RSI, MACD, EMA, Bollinger) · Sentimen berita 30 · Kalender 20 · Price action 10 (VWAP, struktur swing).

| Selisih BUY−SELL | Hasil |
|---|---|
| ≥ 60 | STRONG BUY/SELL (confidence 85-100%) |
| 30 – 59 | BUY/SELL (65-85%) |
| di bawah 30 | NEUTRAL, tidak ada rekomendasi |

Event High-impact dalam 2 jam menurunkan confidence 20 poin.

**Level harga**
- Entry: momentum kuat → harga pasar; pullback ke support/rally ke resistance → limit `S/R ± 0.5 ATR`; retest level yang baru ditembus → `± 0.2 ATR`.
- Stop loss: `1.5 ATR` dari entry, atau sedikit di luar S/R terdekat (`0.3 ATR`); dibatasi antara 0.3% dan 1% dari entry.
- TP1/TP2/TP3 = 1R / 2R / 3R (tutup 40% / 35% / 25%); TP1 digeser jika melewati S/R terdekat.
- R/R yang ditampilkan = rata-rata tertimbang dari ketiga TP (≈1:1.9 pada porsi 40/35/25), bukan 1:3.

**Ukuran lot** (koreksi dari draft awal): 1 lot XAUUSD = 100 oz, jadi pergerakan $1 = $100 per 1.00 lot = **$1 per 0.01 lot**.
`lot = risiko($) / (jarak SL dalam $ × 100)`, dibulatkan ke bawah ke 0.01. Contoh: modal $1.000, risiko 1% ($10), SL 6.50 → 0.0154 → **0.01 lot** (risiko riil $6.50). Jika lot minimum membuat risiko riil melebihi target, aplikasi memberi peringatan. Pada modal kecil hal ini sering terjadi. Di dashboard ini **1 pip = $0.01** (sebagian broker memakai $0.10).

**Arah data kalender** (koreksi dari draft awal): data USD yang *lebih kuat* dari forecast (NFP/CPI naik) cenderung menguatkan dolar dan **bearish untuk emas**; data lebih lemah = bullish. Untuk `unemployment` dan `jobless claims` logikanya dibalik.

## Catatan & keterbatasan

- **Kuota TwelveData**: refresh 60 detik terus-menerus ≈ 1.440 request/hari, melebihi 800. Aplikasi menjeda refresh saat tab tersembunyi dan menghitung pemakaian; saat mendekati batas harian ia beralih ke FCS. FCS hanya memberi *harga terakhir* (tanpa candle), jadi hanya memperbarui candle terakhir dari cache. Atur `REFRESH.PRICE` di config bila perlu.
- **Volume**: TwelveData umumnya tidak menyertakan volume untuk XAU/USD. Bar volume otomatis kosong dan VWAP dihitung berbobot sama.
- **Marketaux free** hanya mengembalikan sedikit artikel per request; aplikasi melengkapinya dengan NewsAPI hingga 10 berita. NewsAPI paket gratis memblokir request browser dari domain selain localhost, jadi di produksi wajib lewat proxy.
- **Kalender**: endpoint Biquote (`api.biquote.io/v1/calendar`) belum bisa saya verifikasi; cek dokumentasinya. Jika gagal, aplikasi mencoba JSON publik ForexFactory (`nfs.faireconomy.media`), yang tidak menyertakan nilai *actual* dan hanya minggu berjalan. Bila kedua sumber ini tidak cocok, ubah `ENDPOINTS.CALENDAR` dan sesuaikan `normalizeCalendar` di `js/api.js`.
- **Sentimen** memakai pencocokan kata kunci: tidak memahami negasi atau konteks. Anggap sebagai indikator kasar.
- Alert harga hanya berjalan **selama tab dashboard terbuka**, dan memeriksa data setiap refresh (60 detik).
- Jam ditampilkan dalam zona waktu `TIMEZONE` di config (default `Asia/Jakarta`).

## Melacak akurasi

10 rekomendasi terakhir tersimpan di localStorage (panel *Riwayat*). Catat hasilnya di akun demo minimal beberapa minggu sebelum mempercayai rumusnya.
