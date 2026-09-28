// ============================================================
// Kalender ekonomi: hari ini + besok, filter impact, sorot event kunci
// ============================================================
import { esc, fmtTime, getConfig } from './utils.js';
import { $, $$, raf } from './ui.js';

const KEY_EVENTS = /non-?farm|nfp|\bcpi\b|fomc|fed(eral)? (funds )?rate|interest rate|rate decision|powell|\bpce\b|\bgdp\b/i;

const state = { impacts: new Set(['High', 'Medium']), usdOnly: false, items: [] };

const dayKey = (d, tz) => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });

export function initCalendarFilters(onChange) {
  $$('#cal-filters [data-impact]').forEach((btn) => {
    btn.setAttribute('aria-pressed', state.impacts.has(btn.dataset.impact));
    btn.addEventListener('click', () => {
      const k = btn.dataset.impact;
      state.impacts.has(k) ? state.impacts.delete(k) : state.impacts.add(k);
      btn.setAttribute('aria-pressed', state.impacts.has(k));
      onChange();
    });
  });
  const usd = $('#cal-usd');
  usd?.addEventListener('change', () => { state.usdOnly = usd.checked; onChange(); });
}

export function renderCalendar(items = state.items) {
  state.items = items;
  const tz = getConfig().TIMEZONE;
  const now = Date.now();
  const today = dayKey(now, tz);
  const tomorrow = dayKey(now + 86400e3, tz);

  const visible = items
    .filter((e) => state.impacts.has(e.impact) && (!state.usdOnly || e.country === 'USD'))
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  const groups = [['Hari ini', today], ['Besok', tomorrow]].map(([title, key]) => ({
    title, events: visible.filter((e) => dayKey(e.time, tz) === key),
  }));

  const row = (e) => {
    const released = String(e.actual) !== '' || new Date(e.time).getTime() < now;
    const key = KEY_EVENTS.test(e.event);
    return `
      <li class="cal-item ${released ? 'released' : 'upcoming'} ${key ? 'key' : ''}" data-impact="${e.impact}">
        <span class="cal-time">${fmtTime(e.time, tz)}</span>
        <span class="cal-country">${esc(e.country)}</span>
        <span class="cal-impact" title="Impact ${e.impact}"></span>
        <span class="cal-event">${esc(e.event)}${key ? '<b class="key-badge">Kunci</b>' : ''}</span>
        <span class="cal-nums">
          <i>F <b>${esc(e.forecast || '-')}</b></i>
          <i>P <b>${esc(e.previous || '-')}</b></i>
          <i>A <b class="${String(e.actual) !== '' ? 'has' : ''}">${esc(String(e.actual) !== '' ? e.actual : '-')}</b></i>
        </span>
      </li>`;
  };

  raf(() => {
    $('#cal-list').innerHTML = groups.map((g) => `
      <li class="cal-day">${g.title}</li>
      ${g.events.length ? g.events.map(row).join('') : '<li class="empty">Tidak ada event sesuai filter.</li>'}
    `).join('');
  });
}
