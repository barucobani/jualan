// ============================================================
// Entry point: memuat config, orkestrasi semua modul, jadwal refresh
// ============================================================
import { setConfig, getConfig, lsGet, lsSet, fmt, fmtSigned, fmtTime, esc } from './utils.js';
import { $, $$, setPanel, toast, raf } from './ui.js';
import { getPrice, getNews, getCalendar, isDemo, isProxy } from './api.js';
import { computeAll, interpret } from './indicators.js';
import { initChart, updateChart, setOverlayVisible, drawLevels } from './chart.js';
import { analyzeNews, renderNews } from './news.js';
import { initCalendarFilters, renderCalendar } from './calendar.js';
import { computeSignal } from './signals.js';
import {
  buildRecommendation, renderRecommendation, saveHistory, renderHistory,
  bindButtons, checkAlerts, TF_LABEL,
} from './recommendation.js';

// State aplikasi
const S = {
  tf: '15min', candles: [], ind: null, prevPrice: null,
  sentiment: null, events: [], rec: null, chartReady: false,
  account: { capital: 1000, riskPercent: 1 },
};

// ---------- Muat config (config.js, jika tidak ada pakai config.example.js) ----------
async function loadConfig() {
  try {
    return (await import('./config.js')).CONFIG;
  } catch {
    console.warn('[app] js/config.js tidak ditemukan, memakai config.example.js');
    return (await import('./config.example.js')).CONFIG;
  }
}

// ---------- Panel harga & indikator ----------
function renderHeaderPrice() {
  const c = S.candles; if (!c.length) return;
  const last = c[c.length - 1];
  const cutoff = last.time - 86400;
  const win = c.filter((x) => x.time > cutoff);
  const use = S.tf === '1day' ? c.slice(-1) : (win.length > 1 ? win : c.slice(-2));
  const hi = Math.max(...use.map((x) => x.high));
  const lo = Math.min(...use.map((x) => x.low));
  const ref = S.tf === '1day' && c.length > 1 ? c[c.length - 2].close : use[0].open;
  const chg = last.close - ref;
  const pct = (chg / ref) * 100;

  raf(() => {
    const el = $('#price');
    const dir = S.prevPrice === null ? 0 : Math.sign(last.close - S.prevPrice);
    el.textContent = fmt(last.close);
    if (dir) {
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth; // restart animasi
      el.classList.add(dir > 0 ? 'flash-up' : 'flash-down');
    }
    const ch = $('#price-change');
    ch.textContent = `${fmtSigned(chg)} (${fmtSigned(pct)}%)`;
    ch.dataset.tone = chg >= 0 ? 'bull' : 'bear';
    $('#hi24').textContent = fmt(hi);
    $('#lo24').textContent = fmt(lo);
  });
  S.prevPrice = last.close;
}

function renderIndicators() {
  const rows = interpret(S.ind.snap);
  raf(() => {
    $('#ind-grid').innerHTML = rows.map((r) => `
      <div class="ind" data-state="${r.state}">
        <span class="ind-name">${r.name}</span>
        <span class="ind-val">${esc(r.value)}</span>
        <span class="ind-note">${esc(r.note)}</span>
      </div>`).join('');
  });
}

// ---------- Sinyal & rekomendasi ----------
function recompute(reason = '') {
  if (!S.ind) return;
  const signal = computeSignal({ snap: S.ind.snap, sentiment: S.sentiment, events: S.events });
  S.rec = buildRecommendation({ signal, snap: S.ind.snap, tf: S.tf, account: S.account });
  renderRecommendation(S.rec, { ts: Date.now() });
  drawLevels(S.rec);
  saveHistory(S.rec); renderHistory();

  raf(() => {
    const b = $('#hdr-signal');
    b.dataset.dir = S.rec.direction;
    $('.sig-label', b).textContent = S.rec.label;
    $('.sig-conf', b).textContent = `${S.rec.confidence}%`;
  });
  console.log(`[app] rekomendasi dihitung ulang (${reason}):`, S.rec.label, S.rec.confidence + '%');
}

// ---------- Loader per panel ----------
async function loadPrice({ force = false } = {}) {
  setPanel('panel-chart', { loading: true });
  try {
    const res = await getPrice(S.tf, { force });
    S.candles = res.candles;
    S.ind = computeAll(S.candles);
    if (S.chartReady) updateChart(S.candles, S.ind.series, S.tf);
    renderHeaderPrice(); renderIndicators();
    setPanel('panel-chart', { ts: res.ts, source: res.source, note: res.stale || res.note ? res.note : '' });
    setPanel('panel-ind', { ts: res.ts });
    $('#demo-banner').hidden = !res.demo;
    checkAlerts(S.candles);
    recompute('harga');
  } catch (e) {
    console.error('[app] harga gagal', e);
    setPanel('panel-chart', { error: `Gagal memuat harga: ${e.message}` });
  }
}

async function loadNews({ force = false } = {}) {
  setPanel('panel-news', { loading: true });
  try {
    const res = await getNews({ force });
    const a = analyzeNews(res.items);
    S.sentiment = a;
    renderNews(a);
    setPanel('panel-news', { ts: res.ts, source: res.source, note: res.stale ? `Data lama: ${res.note}` : '' });
    if (S.ind) recompute('berita');
  } catch (e) {
    console.error('[app] berita gagal', e);
    setPanel('panel-news', { error: `Gagal memuat berita: ${e.message}` });
  }
}

async function loadCalendar({ force = false } = {}) {
  setPanel('panel-cal', { loading: true });
  try {
    const res = await getCalendar({ force });
    S.events = res.items;
    renderCalendar(res.items);
    setPanel('panel-cal', { ts: res.ts, source: res.source, note: res.stale ? `Data lama: ${res.note}` : '' });
    if (S.ind) recompute('kalender');
  } catch (e) {
    console.error('[app] kalender gagal', e);
    setPanel('panel-cal', { error: `Gagal memuat kalender: ${e.message}` });
  }
}

// ---------- Jadwal refresh (jeda saat tab tersembunyi agar hemat kuota) ----------
function schedule() {
  const { REFRESH } = getConfig();
  const every = (fn, ms) => setInterval(() => { if (!document.hidden) fn(); }, ms);
  every(() => loadPrice(), REFRESH.PRICE);
  every(() => loadNews(), REFRESH.NEWS);
  every(() => loadCalendar(), REFRESH.CALENDAR);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { loadPrice(); loadNews(); loadCalendar(); } // cache mencegah request berlebih
  });
  // Segarkan tampilan jam kalender (status "sudah rilis") tiap menit tanpa fetch
  setInterval(() => { if (!document.hidden) renderCalendar(); }, 60000);
}

// ---------- Kontrol UI ----------
function initControls() {
  const prefs = lsGet('prefs', {});
  S.tf = prefs.tf || getConfig().DEFAULT_TIMEFRAME;
  S.account = { ...getConfig().DEFAULT_ACCOUNT, ...(prefs.account || {}) };

  const tfBar = $('#tf-bar');
  tfBar.innerHTML = Object.entries(TF_LABEL).map(([k, v]) =>
    `<button type="button" data-tf="${k}" aria-pressed="${k === S.tf}">${v}</button>`).join('');
  tfBar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tf]'); if (!b || b.dataset.tf === S.tf) return;
    S.tf = b.dataset.tf; S.prevPrice = null;
    $$('#tf-bar button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    lsSet('prefs', { ...lsGet('prefs', {}), tf: S.tf });
    loadPrice();
  });

  // Overlay
  const bb = $('#tog-bb'); const em = $('#tog-ema');
  bb.checked = !!prefs.bb; em.checked = prefs.ema !== false;
  const applyOverlay = () => {
    setOverlayVisible('bb', bb.checked); setOverlayVisible('ema', em.checked);
    lsSet('prefs', { ...lsGet('prefs', {}), bb: bb.checked, ema: em.checked });
  };
  bb.addEventListener('change', applyOverlay); em.addEventListener('change', applyOverlay);
  S.applyOverlay = applyOverlay;

  // Pengaturan akun
  const cap = $('#set-capital'); const rk = $('#set-risk');
  cap.value = S.account.capital; rk.value = S.account.riskPercent;
  const onAcc = () => {
    const capital = Math.max(10, parseFloat(cap.value) || 1000);
    const riskPercent = Math.min(5, Math.max(0.1, parseFloat(rk.value) || 1));
    S.account = { capital, riskPercent };
    lsSet('prefs', { ...lsGet('prefs', {}), account: S.account });
    recompute('pengaturan akun');
  };
  cap.addEventListener('change', onAcc); rk.addEventListener('change', onAcc);

  // Tombol
  bindButtons({ getRec: () => S.rec, onRefresh: () => { recompute('manual'); toast('Analisis dihitung ulang'); } });
  $('#btn-refresh').addEventListener('click', () => {
    loadPrice({ force: true }); loadNews({ force: true }); loadCalendar({ force: true });
  });
  initCalendarFilters(() => renderCalendar());
}

// ---------- Start ----------
async function start() {
  setConfig(await loadConfig());
  initControls();
  renderHistory();

  $('#mode-tag').textContent = isProxy() ? 'via proxy' : 'direct';
  console.log('[app] start. Mode proxy:', isProxy(), '| demo harga:', isDemo('price'));

  // Data dulu (tidak menunggu library chart), chart dimuat lazy
  const dataLoads = Promise.allSettled([loadPrice(), loadNews(), loadCalendar()]);
  try {
    await initChart($('#chart'));
    S.chartReady = true;
    S.applyOverlay();
    if (S.candles.length) updateChart(S.candles, S.ind.series, S.tf);
    drawLevels(S.rec);
  } catch (e) {
    console.error('[app] chart gagal', e);
    $('#chart').innerHTML = `<p class="chart-error">${esc(e.message)}</p>`;
  }
  await dataLoads;
  schedule();
}

start().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('afterbegin', `<p class="fatal">Aplikasi gagal dimulai: ${esc(e.message)}. Pastikan dibuka lewat server (Live Server / Netlify), bukan file://</p>`);
});
