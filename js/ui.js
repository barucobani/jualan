// ============================================================
// Helper UI kecil: selector, status panel, toast
// ============================================================
import { fmtTime, getConfig } from './utils.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Atur status panel.
 * @param {string} id  id elemen panel
 * @param {{loading?:boolean, error?:string, note?:string, ts?:number, source?:string}} o
 */
export function setPanel(id, { loading, error, note, ts, source } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('is-loading', !!loading);
  const msg = $('.panel-msg', el);
  if (msg) {
    const text = error || note || '';
    msg.hidden = !text;
    msg.textContent = text;
    msg.dataset.kind = error ? 'error' : 'note';
  }
  if (ts) {
    const u = $('.updated', el);
    if (u) u.textContent = `Diperbarui ${fmtTime(ts, getConfig().TIMEZONE, true)}`;
  }
  if (source !== undefined) {
    const s = $('.src', el);
    if (s) { s.textContent = source; s.dataset.demo = source === 'DEMO' ? '1' : ''; }
  }
}

let toastTimer;
export function toast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/** Jalankan perubahan DOM di frame berikutnya. */
export const raf = (fn) => requestAnimationFrame(fn);
