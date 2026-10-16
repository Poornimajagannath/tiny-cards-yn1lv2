/**
 * Offline word art — emoji or letter badge. No external URLs.
 * @param {string} wordKeyOrLabel
 * @returns {{ emoji: string, label: string, badge?: boolean }}
 */
const EMOJI = {
  dog: '🐶',
  cat: '🐱',
  mat: '🧺',
  sam: '👧',
  bag: '👜',
  bat: '🦇',
  bus: '🚌',
  can: '🥫',
  cap: '🧢',
  cot: '🛏️',
  cup: '🥤',
  dad: '👨',
  dig: '⛏️',
  fan: '🪭',
  fin: '🐟',
  lap: '🦵',
  lip: '👄',
  man: '👨',
  mop: '🧹',
  nap: '😴',
  pal: '🤝',
  pan: '🍳',
  pen: '✏️',
  pet: '🐾',
  pig: '🐷',
  pin: '📌',
  pot: '🪴',
  sun: '☀️',
  tip: '💡',
  top: '🔝',
  big: '🐘',
  fat: '🐻',
  got: '🎁',
  had: '✅',
  lot: '📦',
  pit: '🕳️',
  sad: '😢',
  sat: '🪑',
  set: '🧰',
  sip: '🧃',
  sit: '🪑',
  ten: '🔟',
  cut: '✂️',
};

/** Abstract / function words → letter badge */
const ABSTRACT = new Set(['on', 'if', 'up', 'at', 'ma']);

/**
 * @param {string} wordKeyOrLabel
 * @returns {{ emoji: string, label: string, badge?: boolean }}
 */
export function artFor(wordKeyOrLabel) {
  const raw = String(wordKeyOrLabel || '').trim();
  const stem = raw.toLowerCase().replace(/_blend$/, '').replace(/_blendrep$/, '');
  const display = raw.replace(/_blend$/, '').replace(/_blendrep$/, '') || stem;

  if (EMOJI[stem]) {
    return { emoji: EMOJI[stem], label: display };
  }
  if (ABSTRACT.has(stem) || !stem) {
    const letter = (stem[0] || '?').toUpperCase();
    return { emoji: letter, label: display, badge: true };
  }
  // Unknown concrete-ish: still show a friendly star badge with letter
  const letter = (stem[0] || '?').toUpperCase();
  return { emoji: letter, label: display, badge: true };
}
