// ============================================================
// Chart candlestick (TradingView Lightweight Charts v4) - dimuat lazy
// ============================================================
import { debounce, getConfig, fmtTime } from './utils.js';

// Dicoba berurutan sampai ada yang berhasil
const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/lightweight-charts/4.1.3/lightweight-charts.standalone.production.js',
  'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
  'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
];

let libPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error(`gagal memuat ${src}`)); };
    document.head.appendChild(s);
  });
}

/** Lazy load library chart, dengan cadangan CDN. */
export function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (!libPromise) {
    libPromise = (async () => {
      for (const url of LIB_URLS) {
        try { await loadScript(url); if (window.LightweightCharts) { console.log('[chart] library dari', url); return window.LightweightCharts; } }
        catch (e) { console.warn('[chart]', e.message); }
      }
      libPromise = null;
      throw new Error('Library chart tidak bisa dimuat. Periksa koneksi internet.');
    })();
  }
  return libPromise;
}

const C = {
  bg: '#131722', text: '#b2b5be', grid: '#1e222d', up: '#26a69a', down: '#ef5350',
  ema20: '#f5a623', ema50: '#2962ff', ema200: '#e040fb', bb: 'rgba(120,123,134,0.9)',
};

const state = { chart: null, s: {}, lastKey: null };

export async function initChart(container) {
  const LW = await loadLib();
  const tz = getConfig().TIMEZONE;
  const chart = LW.createChart(container, {
    autoSize: false,
    width: container.clientWidth, height: container.clientHeight,
    layout: { background: { type: 'solid', color: C.bg }, textColor: C.text, fontFamily: 'IBM Plex Sans, system-ui, sans-serif' },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    rightPriceScale: { borderColor: C.grid },
    timeScale: {
      borderColor: C.grid, timeVisible: true, secondsVisible: false,
      tickMarkFormatter: (t, type) => {
        const d = new Date(t * 1000);
        return type >= 3 ? fmtTime(d, tz) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', timeZone: tz });
      },
    },
    localization: {
      timeFormatter: (t) => new Date(t * 1000).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
      }),
    },
    crosshair: { mode: LW.CrosshairMode.Normal },
  });

  const s = state.s;
  s.candle = chart.addCandlestickSeries({
    upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down,
    wickUpColor: C.up, wickDownColor: C.down,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  });
  s.volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  s.candle.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });

  const line = (color, width = 1) => chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  s.ema20 = line(C.ema20); s.ema50 = line(C.ema50); s.ema200 = line(C.ema200, 2);
  s.bbU = line(C.bb); s.bbL = line(C.bb);
  s.bbU.applyOptions({ lineStyle: 2, visible: false });
  s.bbL.applyOptions({ lineStyle: 2, visible: false });

  // Debounce resize agar tidak boros
  const onResize = debounce(() => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }), 150);
  new ResizeObserver(onResize).observe(container);

  state.chart = chart;
  return chart;
}

const toLine = (candles, arr) => candles
  .map((c, i) => (arr[i] === null || arr[i] === undefined ? null : { time: c.time, value: +arr[i].toFixed(2) }))
  .filter(Boolean);

/** Perbarui data chart. `key` berubah (mis. ganti timeframe) -> fit ulang. */
export function updateChart(candles, series, key) {
  if (!state.chart) return;
  const s = state.s;
  s.candle.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  const hasVol = candles.some((c) => c.volume > 0);
  s.volume.setData(hasVol ? candles.map((c) => ({
    time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)',
  })) : []);
  s.ema20.setData(toLine(candles, series.ema20));
  s.ema50.setData(toLine(candles, series.ema50));
  s.ema200.setData(toLine(candles, series.ema200));
  s.bbU.setData(toLine(candles, series.bb.upper));
  s.bbL.setData(toLine(candles, series.bb.lower));
  if (state.lastKey !== key) {
    state.chart.timeScale().fitContent();
    // tampilkan ~120 candle terakhir agar tidak terlalu rapat
    const n = candles.length;
    if (n > 120) state.chart.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 3 });
    state.lastKey = key;
  }
}

export function setOverlayVisible(name, visible) {
  const s = state.s;
  if (name === 'bb') { s.bbU?.applyOptions({ visible }); s.bbL?.applyOptions({ visible }); }
  if (name === 'ema') ['ema20', 'ema50', 'ema200'].forEach((k) => s[k]?.applyOptions({ visible }));
}

/** Gambar garis level entry/SL/TP pada chart (opsional). */
let priceLines = [];
export function drawLevels(rec) {
  const s = state.s;
  if (!s.candle) return;
  priceLines.forEach((l) => s.candle.removePriceLine(l));
  priceLines = [];
  if (!rec || rec.direction === 'NEUTRAL') return;
  const add = (price, color, title) => priceLines.push(s.candle.createPriceLine({
    price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title,
  }));
  add(rec.entry, '#2962ff', 'Entry');
  add(rec.stopLoss, '#ef5350', 'SL');
  rec.takeProfits.forEach((t) => add(t.price, '#26a69a', `TP${t.level}`));
}
