// ============================================================
// Trade Recommendation Engine: gabungkan sinyal + level + risk,
// render panel, copy 1-klik, alert harga, riwayat 10 terakhir.
// ============================================================
import { fmt, fmtSigned, esc, lsGet, lsSet, fmtDateTime, getConfig, round2 } from './utils.js';
import { calcLevels, holdEstimate } from './tradeLevels.js';
import { positionSize, pnl, toPips } from './riskManager.js';
import { $, toast, raf } from './ui.js';
import { tfSeconds } from './demo.js';

export const TF_LABEL = { '1min': '1M', '5min': '5M', '15min': '15M', '1h': '1H', '4h': '4H', '1day': '1D' };
const EMOJI = { BUY: '🟢', SELL: '🔴', NEUTRAL: '⏸️' };

/** Bangun objek rekomendasi lengkap. */
export function buildRecommendation({ signal, snap, tf, account }) {
  const c = getConfig();
  const base = {
    timestamp: new Date().toISOString(),
    direction: signal.direction, label: signal.label, confidence: signal.confidence,
    timeframe: TF_LABEL[tf] || tf, tfKey: tf, hold: holdEstimate(tf),
    price: snap.price, score: { buy: signal.buy, sell: signal.sell, net: signal.net },
    reasons: signal.reasons, warnings: [...signal.warnings],
  };
  if (signal.direction === 'NEUTRAL' || !snap.atr) {
    if (!snap.atr) base.warnings.push('Data candle belum cukup untuk menghitung ATR');
    return { ...base, direction: 'NEUTRAL', label: 'NEUTRAL' };
  }

  const lv = calcLevels(signal.direction, snap);
  const size = positionSize({
    capital: account.capital, riskPercent: account.riskPercent,
    entry: lv.entry, stopLoss: lv.stopLoss,
    contractSize: c.CONTRACT_SIZE, minLot: c.MIN_LOT,
  });
  const warnings = [...base.warnings, ...lv.warnings, ...size.warnings];
  if (size.lot < 0.03) warnings.push('Lot terlalu kecil untuk partial close 40/35/25 (lot minimum 0.01). Pertimbangkan satu target saja.');

  const takeProfits = lv.takeProfits.map((t) => ({
    ...t,
    pips: toPips(t.price - lv.entry),
    usd: pnl(round2(size.lot * (t.percentage / 100)), t.diff, c.CONTRACT_SIZE), // profit porsi yang ditutup
  }));

  return {
    ...base,
    orderType: lv.orderType, scenario: lv.scenario,
    entry: lv.entry, stopLoss: lv.stopLoss,
    slDiff: lv.slDiff, slPct: lv.slPct, slPips: toPips(lv.slDiff),
    takeProfits, riskRewardRatio: lv.riskRewardRatio,
    riskAmount: size.riskTarget, riskActual: size.riskActual,
    positionSize: size.lot,
    account: { ...account },
    warnings,
  };
}

// ---------------------------------------------------------------
// FORMAT TEKS UNTUK COPY
// ---------------------------------------------------------------
const LINE = '━━━━━━━━━━━━━━━━━━━━━━';

export function formatTradeSetup(rec) {
  const tz = getConfig().TIMEZONE;
  const now = fmtDateTime(Date.now(), tz);
  const row = (k, v) => `${k.padEnd(13)}: ${v}`;
  const out = ['📊 XAUUSD TRADE SETUP', LINE,
    row('Arah', `${EMOJI[rec.direction]} ${rec.direction}${rec.label !== rec.direction ? ` (${rec.label})` : ''}`),
    row('Confidence', `${rec.confidence}%`),
    row('Timeframe', rec.timeframe),
    row('Waktu', `${now} (${tz})`),
    LINE,
  ];
  if (rec.direction === 'NEUTRAL') {
    out.push('Tidak ada rekomendasi. Pasar sideways / sinyal belum jelas.');
  } else {
    out.push(
      row('Order', `${rec.orderType} (${rec.scenario})`),
      row('Entry Price', fmt(rec.entry)),
      row('Stop Loss', `${fmt(rec.stopLoss)} (-${fmt(rec.slDiff)} / -${fmt(rec.slPct)}% / ${fmt(rec.slPips, 0)} pips)`),
      ...rec.takeProfits.map((t) => row(`Take Profit ${t.level}`, `${fmt(t.price)} (+${fmt(t.diff)} / +${fmt(t.pct)}% / ${fmt(t.pips, 0)} pips) | ${t.percentage}%`)),
      LINE,
      row('Risk/Reward', `1:${fmt(rec.riskRewardRatio, 1)} (rata-rata tertimbang)`),
      row('Position Size', `${rec.positionSize.toFixed(2)} lot`),
      row('Risk Amount', `$${fmt(rec.riskActual)} (target ${rec.account.riskPercent}% dari $${fmt(rec.account.capital, 0)})`),
      row('Estimasi Hold', rec.hold),
    );
  }
  if (rec.reasons.length) out.push(LINE, '📌 Alasan:', ...rec.reasons.map((r) => `• ${r}`));
  if (rec.warnings.length) out.push(LINE, '⚠️ Peringatan:', ...rec.warnings.map((w) => `• ${w}`));
  out.push(LINE, '⚠️ Disclaimer: Bukan nasihat keuangan. Trading memiliki risiko.');
  return out.join('\n');
}

/** Salin teks ke clipboard (API modern + fallback textarea). */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    throw new Error('clipboard API tidak tersedia');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { console.error('[copy] gagal', e); return false; }
  }
}

// ---------------------------------------------------------------
// RIWAYAT
// ---------------------------------------------------------------
export function saveHistory(rec) {
  if (rec.direction === 'NEUTRAL') return;
  const hist = lsGet('history', []);
  const l = hist[0];
  if (l && l.direction === rec.direction && l.tfKey === rec.tfKey && Math.abs(l.entry - rec.entry) < 1) return; // hindari duplikat tiap menit
  hist.unshift({
    timestamp: rec.timestamp, direction: rec.direction, label: rec.label, confidence: rec.confidence,
    tfKey: rec.tfKey, timeframe: rec.timeframe, entry: rec.entry, stopLoss: rec.stopLoss,
    tp: rec.takeProfits.map((t) => t.price),
  });
  lsSet('history', hist.slice(0, 10));
}

export function renderHistory() {
  const el = $('#rec-history');
  if (!el) return;
  const tz = getConfig().TIMEZONE;
  const hist = lsGet('history', []);
  raf(() => {
    el.innerHTML = hist.length ? hist.map((h) => `
      <li data-dir="${h.direction}">
        <span>${fmtDateTime(h.timestamp, tz).slice(11, 16)} · ${h.timeframe}</span>
        <b>${h.direction}</b>
        <span>E ${fmt(h.entry)} · SL ${fmt(h.stopLoss)} · TP1 ${fmt(h.tp[0])}</span>
        <em>${h.confidence}%</em>
      </li>`).join('') : '<li class="empty">Belum ada riwayat.</li>';
  });
}

// ---------------------------------------------------------------
// ALERT HARGA (browser notification)
// ---------------------------------------------------------------
export const getAlert = () => lsGet('alert', null);

export async function setAlert(rec) {
  if (!rec || rec.direction === 'NEUTRAL') return false;
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* abaikan */ }
  }
  lsSet('alert', {
    created: Date.now(), direction: rec.direction, tfKey: rec.tfKey,
    entry: rec.entry, stopLoss: rec.stopLoss, tps: rec.takeProfits.map((t) => t.price),
    startSide: rec.price >= rec.entry ? 'above' : 'below', hit: {},
  });
  return true;
}

export function clearAlert() { lsSet('alert', null); }

function notify(title, body) {
  toast(`${title}: ${body}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* beberapa browser mobile tidak mendukung */ }
  }
}

/** Cek apakah candle terbaru menyentuh level alert. */
export function checkAlerts(candles) {
  const a = getAlert();
  if (!a || !candles.length) return;
  const since = Math.floor(a.created / 1000) - tfSeconds(a.tfKey);
  const recent = candles.filter((c) => c.time >= since);
  if (!recent.length) return;
  const hi = Math.max(...recent.map((c) => c.high));
  const lo = Math.min(...recent.map((c) => c.low));
  const buy = a.direction === 'BUY';
  const touched = (lvl) => lo <= lvl && hi >= lvl;
  let changed = false;
  const fire = (id, title, body) => { if (!a.hit[id]) { a.hit[id] = true; changed = true; notify(title, body); } };

  if (touched(a.entry)) fire('entry', 'XAUUSD: Entry tersentuh', `${a.direction} @ ${fmt(a.entry)}`);
  if (a.hit.entry) {
    if (buy ? lo <= a.stopLoss : hi >= a.stopLoss) fire('sl', 'XAUUSD: Stop Loss kena', fmt(a.stopLoss));
    a.tps.forEach((p, i) => { if (buy ? hi >= p : lo <= p) fire(`tp${i + 1}`, `XAUUSD: TP${i + 1} tercapai`, fmt(p)); });
  }
  if (changed) lsSet('alert', a);
}

// ---------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------
export function renderRecommendation(rec, { ts } = {}) {
  const card = $('#rec-card');
  const tz = getConfig().TIMEZONE;
  const dirText = rec.direction === 'NEUTRAL' ? 'TIDAK ADA REKOMENDASI' : `REKOMENDASI: ${rec.label}`;

  let body;
  if (rec.direction === 'NEUTRAL') {
    body = `
      <div class="rec-empty">
        <strong>⏸️ Tidak ada rekomendasi</strong>
        <p>Pasar sedang sideways atau sinyal belum jelas. Tunggu konfirmasi yang lebih kuat.</p>
        <small>Skor BUY ${rec.score.buy} · SELL ${rec.score.sell} · selisih ${fmtSigned(rec.score.net, 0)}</small>
      </div>`;
  } else {
    const tpRows = rec.takeProfits.map((t) => `
      <tr class="tp">
        <th>Take Profit ${t.level}</th>
        <td class="px">${fmt(t.price)}</td>
        <td>+${fmt(t.diff)} <span>/ +${fmt(t.pct)}% / ${fmt(t.pips, 0)} pips</span></td>
        <td>${t.percentage}% · +$${fmt(t.usd)}</td>
      </tr>`).join('');
    body = `
      <table class="levels">
        <tr class="entry">
          <th>Entry <small>${rec.orderType}</small></th>
          <td class="px">${fmt(rec.entry)}</td>
          <td colspan="2"><span>${esc(rec.scenario)}</span></td>
        </tr>
        <tr class="sl">
          <th>Stop Loss</th>
          <td class="px">${fmt(rec.stopLoss)}</td>
          <td>-${fmt(rec.slDiff)} <span>/ -${fmt(rec.slPct)}% / ${fmt(rec.slPips, 0)} pips</span></td>
          <td>-$${fmt(rec.riskActual)}</td>
        </tr>
        ${tpRows}
      </table>
      <dl class="metrics">
        <div><dt>Risk/Reward</dt><dd>1:${fmt(rec.riskRewardRatio, 1)}</dd></div>
        <div><dt>Ukuran posisi</dt><dd>${rec.positionSize.toFixed(2)} lot</dd></div>
        <div><dt>Risiko</dt><dd>$${fmt(rec.riskActual)} <span>dari target ${rec.account.riskPercent}%</span></dd></div>
        <div><dt>Estimasi hold</dt><dd>${esc(rec.hold)}</dd></div>
      </dl>`;
  }

  const reasons = rec.reasons.length ? `<ul class="reasons">${rec.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
  const warns = rec.warnings.length ? `<ul class="warns">${rec.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';

  raf(() => {
    card.dataset.dir = rec.direction;
    $('#rec-title').textContent = `${EMOJI[rec.direction]} ${dirText}`;
    $('#rec-conf').textContent = rec.direction === 'NEUTRAL' ? `Keyakinan rendah ${rec.confidence}%` : `Confidence ${rec.confidence}%`;
    $('#rec-tf').textContent = `Timeframe ${rec.timeframe}`;
    $('#rec-bar').style.width = `${rec.confidence}%`;
    $('#rec-body').innerHTML = body + reasons + warns;
    $('#rec-time').textContent = `Analisis terakhir: ${fmtDateTime(ts || Date.now(), tz).slice(11)}`;
    const none = rec.direction === 'NEUTRAL';
    $('#btn-copy').disabled = none;
    $('#btn-alert').disabled = none;
    $('#btn-copy').title = none ? 'Tidak ada rekomendasi untuk disalin' : '';
  });
}

/** Hubungkan tombol Copy / Alert / Refresh. */
export function bindButtons({ getRec, onRefresh }) {
  const flash = (btn, text, ms = 2000) => {
    const orig = btn.dataset.label || (btn.dataset.label = btn.textContent);
    btn.textContent = text; btn.classList.add('flash');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('flash'); }, ms);
  };

  $('#btn-copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget; // simpan sebelum await (currentTarget jadi null setelahnya)
    const rec = getRec();
    if (!rec || rec.direction === 'NEUTRAL') return;
    const ok = await copyText(formatTradeSetup(rec));
    console.log(ok ? `Trade setup copied: ${new Date().toISOString()}` : 'Trade setup GAGAL disalin');
    flash(btn, ok ? '✅ Copied!' : '❌ Gagal copy');
  });

  $('#btn-alert').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const rec = getRec();
    const ok = await setAlert(rec);
    flash(btn, ok ? '🔔 Alert aktif' : 'Tidak ada setup');
    if (ok && 'Notification' in window && Notification.permission === 'denied') {
      toast('Notifikasi browser diblokir; alert hanya tampil sebagai pesan di halaman.');
    }
  });

  $('#btn-refresh-analysis').addEventListener('click', () => onRefresh());
}
