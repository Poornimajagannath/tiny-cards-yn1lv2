/**
 * AudioEngine — iOS unlock, fresh-Audio-per-tap, single active clip.
 * Does not know about lessons or DOM.
 */

export class AudioEngine {
  /**
   * @param {import('./catalog.js').Catalog} catalog
   */
  constructor(catalog) {
    this._catalog = catalog;
    this._unlocked = false;
    /** @type {HTMLAudioElement | null} */
    this._current = null;
  }

  /** Idempotent. Safe to call on every gesture; first call performs unlock. */
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    try {
      const url = this._catalog.urlFor('m') || this._catalog.urlFor('a');
      if (!url) return;
      const a = new Audio((globalThis.SOUND_DATA||{})[url]||url);
      a.playsInline = true;
      a.setAttribute('playsinline', '');
      a.muted = true;
      const p = a.play();
      if (p && p.then) {
        p.then(() => {
          a.pause();
          a.muted = false;
          a.currentTime = 0;
        }).catch(() => {});
      }
    } catch (_) {
      /* ignore unlock failures */
    }
  }

  /**
   * Play by SoundKey. No-ops unknown keys. Stops prior clip.
   * @param {string} key
   */
  play(key) {
    const url = this._catalog.urlFor(key);
    if (!url) return;
    try {
      if (this._current) {
        try {
          this._current.pause();
        } catch (_) {}
      }
      // Fresh Audio each tap — more reliable on iPhone over Cloudflare
      const a = new Audio((globalThis.SOUND_DATA||{})[url]||url);
      a.playsInline = true;
      a.setAttribute('playsinline', '');
      a.preload = 'auto';
      this._current = a;
      const p = a.play();
      if (p && p.catch) {
        p.catch(() => {
          a.load();
          a.play().catch((e) => {
            console.log(e);
          });
        });
      }
    } catch (_) {
      /* ignore play failures */
    }
  }

  /** Pause and clear current clip. */
  stop() {
    if (this._current) {
      try {
        this._current.pause();
        this._current.currentTime = 0;
      } catch (_) {}
      this._current = null;
    }
  }

  get isUnlocked() {
    return this._unlocked;
  }
}
