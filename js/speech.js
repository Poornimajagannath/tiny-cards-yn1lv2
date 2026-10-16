/**
 * Quiet speechSynthesis helper for NumberDeck.
 * Reading stays on recorded mp3s (AudioEngine).
 */

export class Voice {
  constructor() {
    this._unlocked = false;
  }

  /** Call from a tap. Unlocks iOS utterance playback. */
  unlock() {
    if (this._unlocked) return;
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth) {
      this._unlocked = true;
      return;
    }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
      synth.cancel();
    } catch (_) {
      /* ignore */
    }
    this._unlocked = true;
  }

  /**
   * @param {string} text
   * @param {{ rate?: number }} [opts]
   */
  speak(text) {
    const w = String(text || '').trim().toLowerCase();
    if (REC.has(w)) {
      try {
        if (this._a) this._a.pause();
        const src = (globalThis.SOUND_DATA && globalThis.SOUND_DATA['sounds/num/' + w + '.mp3']) ||
          new URL('../sounds/num/' + w + '.mp3', import.meta.url).href;
        const a = new Audio(src);
        a.playsInline = true;
        a.setAttribute('playsinline', '');
        this._a = a;
        const p = a.play();
        if (p && p.catch) p.catch(() => this._synth(text));
        return;
      } catch (_) { /* fall through */ }
    }
    this._synth(text);
  }

  _synth(text) {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth || !text) return;
    this.unlock();
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.rate = 0.85;
      u.pitch = 1;
      u.lang = 'en-US';
      synth.speak(u);
    } catch (_) {
      /* ignore */
    }
  }

  stop() {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth) return;
    try {
      synth.cancel();
    } catch (_) {}
  }

  get isUnlocked() {
    return this._unlocked;
  }
}

const REC = new Set(['zero','one','two','three','four','five','six','seven','eight','nine','ten','none']);

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** @param {number} n */
export function numberWord(n) {
  const i = Number(n);
  if (Number.isInteger(i) && i >= 0 && i < WORDS.length) return WORDS[i];
  return String(n);
}
