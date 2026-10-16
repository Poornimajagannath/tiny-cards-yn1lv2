/**
 * Wooden-block towers. No faces, no cartoon.
 */

export const WOOD = [
  '#d7c4a3',
  '#c4a574',
  '#b08968',
  '#a47148',
  '#8c5a3c',
  '#cbb891',
  '#b5976b',
  '#9c734c',
  '#7a4a32',
  '#6b3f2a',
];

/**
 * @param {HTMLElement} host
 * @param {number} n
 * @param {{ interactive?: boolean, onRemove?: () => void }} [opts]
 */
export function renderTower(host, n, opts = {}) {
  if (!host) return;
  host.innerHTML = '';
  host.classList.add('tower');
  const count = Math.max(0, Number(n) || 0);
  for (let i = 0; i < count; i++) {
    const b = document.createElement(opts.interactive ? 'button' : 'div');
    b.className = 'block';
    b.style.backgroundColor = WOOD[i % WOOD.length];
    if (opts.interactive) {
      b.type = 'button';
      b.setAttribute('aria-label', 'Take one away');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opts.onRemove) opts.onRemove();
      });
    }
    host.appendChild(b);
  }
}

/** Ordered 1–10. Look mode starts at 1–5; 6–10 is the stretch. */
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Totals ≤ 5 first, then stretch through 10. */
export const FACTS = [
  [1, 1],
  [2, 1],
  [1, 2],
  [3, 1],
  [2, 2],
  [4, 1],
  [3, 2],
  [1, 3],
  [5, 1],
  [4, 2],
  [3, 3],
  [6, 1],
  [5, 2],
  [4, 3],
  [7, 1],
  [6, 2],
  [5, 3],
  [8, 1],
  [4, 4],
  [9, 1],
  [5, 5],
];

export function factTotal(fact) {
  return fact[0] + fact[1];
}
