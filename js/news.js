// ============================================================
// Feed berita + analisis sentimen (keyword matching sederhana)
// Catatan: metode ini tidak memahami negasi/konteks ("gold fails to rally"
// terhitung bullish). Anggap sebagai indikator kasar.
// ============================================================
import { esc, safeUrl, timeAgo, clamp } from './utils.js';
import { $, raf } from './ui.js';

// Awalan kata (prefix match): "gain" cocok dengan "gains", "gained"
const BULL = [
  'rally', 'surge', 'gain', 'bullish', 'uptrend', 'safe haven', 'safe-haven', 'record high',
  'soar', 'jump', 'climb', 'rising', 'rebound', 'rate cut', 'dovish', 'weaker dollar',
  'dollar weakens', 'dollar slips', 'haven demand',
];
const BEAR = [
  'drop', 'fall', 'bearish', 'downtrend', 'sell-off', 'selloff', 'sell off', 'strengthen dollar',
  'dollar strengthens', 'stronger dollar', 'dollar gains', 'slump', 'plunge', 'slip', 'declin',
  'rate hike', 'hawkish', 'tumble', 'retreat', 'weigh',
];

const toRegex = (words) => new RegExp(`\\b(?:${words.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`, 'gi');
const BULL_RE = toRegex(BULL);
const BEAR_RE = toRegex(BEAR);

/** Skor satu artikel: -1 (bearish) .. +1 (bullish). */
export function scoreText(text) {
  const bull = (text.match(BULL_RE) || []).length;
  const bear = (text.match(BEAR_RE) || []).length;
  return clamp(bull - bear, -2, 2) / 2;
}

export const sentimentLabel = (sc) => (
  sc >= 71 ? 'Bullish kuat' : sc >= 56 ? 'Bullish' : sc > 45 ? 'Netral' : sc > 30 ? 'Bearish' : 'Bearish kuat'
);

/** Analisis semua berita -> skor agregat 0-100. */
export function analyzeNews(items) {
  if (!items?.length) return { score: null, label: '-', items: [] };
  const scored = items.map((n) => {
    const s = scoreText(`${n.title} ${n.description || ''}`);
    return { ...n, sentiment: s > 0 ? 'bull' : s < 0 ? 'bear' : 'neutral', s };
  });
  const mean = scored.reduce((a, n) => a + n.s, 0) / scored.length;
  const score = Math.round(50 + 50 * mean);
  return { score, label: sentimentLabel(score), items: scored };
}

const TAG = { bull: 'Bullish', bear: 'Bearish', neutral: 'Netral' };

export function renderNews(analysis) {
  const list = $('#news-list');
  const gauge = $('#news-gauge');
  raf(() => {
    if (analysis.score !== null) {
      const tone = analysis.score >= 56 ? 'bull' : analysis.score <= 45 ? 'bear' : 'neutral';
      gauge.dataset.tone = tone;
      $('.gauge-score', gauge).textContent = analysis.score;
      $('.gauge-label', gauge).textContent = analysis.label;
      $('.gauge-marker', gauge).style.left = `${analysis.score}%`;
    }
    list.innerHTML = analysis.items.length
      ? analysis.items.map((n) => `
        <li class="news-item">
          ${n.image ? `<img class="news-thumb" src="${esc(safeUrl(n.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '<div class="news-thumb ph"></div>'}
          <div class="news-main">
            <a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
            <div class="news-meta">
              <span>${esc(n.source)}</span>
              <span>${n.publishedAt ? timeAgo(n.publishedAt) : ''}</span>
              <span class="tag ${n.sentiment}">${TAG[n.sentiment]}</span>
            </div>
          </div>
        </li>`).join('')
      : '<li class="empty">Belum ada berita.</li>';
  });
}
