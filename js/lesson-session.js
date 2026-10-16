/**
 * LessonSession — mounts one lesson UI + drag-hold policy + WordDeck.
 * Does not fetch curriculum — only renders a Lesson.
 */


/**
 * Drag-hold policy for continuous letter sounds.
 * Plays once on reaching track end; 2s hold → ok.
 * @param {Object} opts
 * @param {HTMLElement} opts.trackWrap
 * @param {HTMLElement} opts.statusEl
 * @param {{letter:string, say:string, key:string}} opts.sound
 * @param {import('./audio-engine.js').AudioEngine} opts.audio
 * @returns {() => void} cleanup
 */
export function attachDragHold(opts) {
  const { trackWrap, statusEl, sound, audio } = opts;
  const knob = trackWrap.querySelector('.knob');
  if (!knob) return () => {};

  let dragging = false;
  let holdTimer = null;
  let startClientX = 0;
  let startLeft = 0;
  let played = false;

  function range() {
    const w = trackWrap.clientWidth;
    return { min: w * 0.1, max: w * 0.9 };
  }
  function setLeft(px) {
    const r = range();
    const v = Math.max(r.min, Math.min(r.max, px));
    knob.style.left = v + 'px';
    return v >= r.max - 1;
  }
  function clearHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    knob.classList.remove('ok');
    played = false;
  }
  function atEndHold(atEnd) {
    clearHold();
    if (!atEnd) {
      statusEl.innerHTML = 'Say <strong>' + sound.say + '</strong>';
      return;
    }
    statusEl.textContent = 'Hold… keep saying ' + sound.say;
    if (!played) {
      audio.play(sound.key);
      played = true;
    }
    holdTimer = setTimeout(() => {
      knob.classList.add('ok');
      statusEl.textContent = 'Nice — ' + sound.say + ' ✓';
    }, 2000);
  }
  function clientX(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
    return e.clientX;
  }
  function down(e) {
    e.preventDefault();
    dragging = true;
    clearHold();
    const r = range();
    startLeft = parseFloat(knob.style.left) || r.min;
    startClientX = clientX(e);
  }
  function move(e) {
    if (!dragging) return;
    e.preventDefault();
    atEndHold(setLeft(startLeft + (clientX(e) - startClientX)));
  }
  function up(e) {
    if (!dragging) return;
    e.preventDefault();
    dragging = false;
    const r = range();
    const cur = parseFloat(knob.style.left) || r.min;
    if (cur < r.max - 1) {
      clearHold();
      setLeft(r.min);
      statusEl.innerHTML = 'Say <strong>' + sound.say + '</strong>';
    }
  }

  trackWrap.addEventListener('touchstart', down, { passive: false });
  trackWrap.addEventListener('touchmove', move, { passive: false });
  trackWrap.addEventListener('touchend', up, { passive: false });
  trackWrap.addEventListener('touchcancel', up, { passive: false });
  trackWrap.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  setLeft(range().min);

  return () => {
    clearHold();
    trackWrap.removeEventListener('touchstart', down);
    trackWrap.removeEventListener('touchmove', move);
    trackWrap.removeEventListener('touchend', up);
    trackWrap.removeEventListener('touchcancel', up);
    trackWrap.removeEventListener('mousedown', down);
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
}

const SWIPE_THRESHOLD = 50;
const TAP_SLOP = 12;

/**
 * Find blend cue for a build by label or stem (build.key).
 * @param {{label:string,key:string}[]} blends
 * @param {{label:string,key:string}} build
 */
function blendForBuild(blends, build) {
  if (!blends || !build) return null;
  const byLabel = blends.find((b) => b.label === build.label);
  if (byLabel) return byLabel;
  const stem = build.key;
  return (
    blends.find((b) => b.key === stem + '_blend' || b.key === stem) ||
    blends.find((b) => b.label.toLowerCase() === String(build.label).toLowerCase()) ||
    null
  );
}

/**
 * WordDeck — owns focus index; one card + one blend at a time.
 * build.parts and lesson.script are teacher-only and must not be mounted here.
 */
class WordDeck {
  /**
   * @param {Object} opts
   * @param {{label:string,key:string,parts?:string}[]} opts.builds
   * @param {{label:string,key:string}[]} opts.blends
   * @param {HTMLElement} opts.viewport
   * @param {HTMLElement} opts.dotsEl
   * @param {HTMLButtonElement} opts.prevBtn
   * @param {HTMLButtonElement} opts.nextBtn
   * @param {HTMLButtonElement} opts.blendBtn
   * @param {import('./audio-engine.js').AudioEngine} opts.audio
   */
  constructor(opts) {
    this.builds = opts.builds || [];
    this.blends = opts.blends || [];
    this.index = 0;
    this._viewport = opts.viewport;
    this._dotsEl = opts.dotsEl;
    this._prevBtn = opts.prevBtn;
    this._nextBtn = opts.nextBtn;
    this._blendBtn = opts.blendBtn;
    this._audio = opts.audio;
    this._animating = false;
    this._cleanups = [];
  }

  get focused() {
    return this.builds[this.index] || null;
  }

  mount() {
    this.disposeHandlers();
    if (!this.builds.length) {
      if (this._viewport) this._viewport.innerHTML = '';
      if (this._blendBtn) this._blendBtn.innerHTML = '';
      return;
    }
    this.index = Math.max(0, Math.min(this.index, this.builds.length - 1));
    this._renderCard(null);
    this._renderDots();
    this._renderBlend();
    this._wireNav();
    this._wireSwipe();
  }

  /**
   * @param {'left'|'right'|null} enterFrom
   */
  _renderCard(enterFrom) {
    const viewport = this._viewport;
    if (!viewport) return;
    const build = this.focused;
    if (!build) {
      viewport.innerHTML = '';
      return;
    }
    const card = document.createElement('div');
    card.className = 'deck-card';
    if (enterFrom === 'left') card.classList.add('swipe-in-from-left');
    if (enterFrom === 'right') card.classList.add('swipe-in-from-right');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Play word ' + build.label);

    const speak = document.createElement('button');
    speak.type = 'button';
    speak.className = 'deck-speak';
    speak.setAttribute('aria-label', 'Play word');
    speak.textContent = '🔊';

    const wordEl = document.createElement('div');
    wordEl.className = 'deck-word';
    wordEl.textContent = build.label;

    card.appendChild(speak);
    card.appendChild(wordEl);
    viewport.innerHTML = '';
    viewport.appendChild(card);

    const playWord = (e) => {
      if (e) e.stopPropagation();
      this._audio.unlock();
      this._audio.play(build.key);
    };
    speak.addEventListener('click', playWord);
    card.addEventListener('click', (e) => {
      if (e.target === speak || speak.contains(e.target)) return;
      playWord(e);
    });
  }

  _renderDots() {
    const dotsEl = this._dotsEl;
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    this.builds.forEach((_, i) => {
      const s = document.createElement('span');
      if (i === this.index) s.className = 'on';
      s.setAttribute('aria-hidden', 'true');
      dotsEl.appendChild(s);
    });
    if (this._prevBtn) this._prevBtn.disabled = this.index <= 0;
    if (this._nextBtn) this._nextBtn.disabled = this.index >= this.builds.length - 1;
  }

  _renderBlend() {
    const btn = this._blendBtn;
    if (!btn) return;
    const build = this.focused;
    if (!build) {
      btn.innerHTML = '';
      btn.onclick = null;
      return;
    }
    const blend = blendForBuild(this.blends, build);
    const label = build.label;
    btn.innerHTML =
      '<span class="w">' +
      label +
      '</span><span class="tag">slow → ' +
      label +
      ' ' +
      label +
      '</span>';
    const key = blend ? blend.key : build.key + '_blend';
    btn.onclick = () => {
      this._audio.unlock();
      this._audio.play(key);
    };
  }

  /**
   * @param {number} delta  +1 next, -1 prev
   */
  go(delta) {
    if (this._animating) return;
    const next = this.index + delta;
    if (next < 0 || next >= this.builds.length) return;
    const card = this._viewport && this._viewport.querySelector('.deck-card');
    const outClass = delta > 0 ? 'swipe-out-left' : 'swipe-out-right';
    const enterFrom = delta > 0 ? 'right' : 'left';
    this._animating = true;
    if (card) {
      card.classList.remove('swipe-in-from-left', 'swipe-in-from-right');
      card.classList.add(outClass);
      const done = () => {
        this.index = next;
        this._renderCard(enterFrom);
        this._renderDots();
        this._renderBlend();
        this._animating = false;
      };
      window.setTimeout(done, 260);
    } else {
      this.index = next;
      this._renderCard(enterFrom);
      this._renderDots();
      this._renderBlend();
      this._animating = false;
    }
  }

  _wireNav() {
    const onPrev = () => this.go(-1);
    const onNext = () => this.go(1);
    if (this._prevBtn) {
      this._prevBtn.addEventListener('click', onPrev);
      this._cleanups.push(() => this._prevBtn.removeEventListener('click', onPrev));
    }
    if (this._nextBtn) {
      this._nextBtn.addEventListener('click', onNext);
      this._cleanups.push(() => this._nextBtn.removeEventListener('click', onNext));
    }
  }

  _wireSwipe() {
    const el = this._viewport;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let axis = null; // 'h' | 'v' | null
    let moved = false;

    const point = (e) => {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches[0])
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onStart = (e) => {
      if (this._animating) return;
      const p = point(e);
      startX = p.x;
      startY = p.y;
      tracking = true;
      axis = null;
      moved = false;
    };
    const onMove = (e) => {
      if (!tracking) return;
      const p = point(e);
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (axis == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (axis === 'h') {
        // Keep vertical page scroll free; only lock horizontal on the deck
        if (e.cancelable) e.preventDefault();
        if (Math.abs(dx) > TAP_SLOP) moved = true;
        const card = el.querySelector('.deck-card');
        if (card) {
          card.style.transition = 'none';
          card.style.transform = 'translateX(' + dx + 'px)';
          card.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 220));
        }
      }
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const p = point(e);
      const dx = p.x - startX;
      const card = el.querySelector('.deck-card');
      if (card) {
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
      }
      if (axis === 'h' && Math.abs(dx) >= SWIPE_THRESHOLD) {
        if (dx < 0) this.go(1);
        else this.go(-1);
        // Prevent the synthetic click after a real swipe
        if (e.cancelable) e.preventDefault();
      } else if (!moved && axis !== 'v') {
        // Tiny move = tap → play (handled by card click); no-op here
      }
      axis = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });

    // Pointer/mouse fallback for desktop
    let mouseDown = false;
    const onMouseDown = (e) => {
      mouseDown = true;
      onStart(e);
    };
    const onMouseMove = (e) => {
      if (!mouseDown) return;
      onMove(e);
    };
    const onMouseUp = (e) => {
      if (!mouseDown) return;
      mouseDown = false;
      onEnd(e);
    };
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    this._cleanups.push(() => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    });
  }

  disposeHandlers() {
    for (const fn of this._cleanups) {
      try {
        fn();
      } catch (_) {}
    }
    this._cleanups = [];
  }

  dispose() {
    this.disposeHandlers();
    if (this._viewport) this._viewport.innerHTML = '';
    if (this._dotsEl) this._dotsEl.innerHTML = '';
    if (this._blendBtn) {
      this._blendBtn.innerHTML = '';
      this._blendBtn.onclick = null;
    }
  }
}

export class LessonSession {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.root
   * @param {object} opts.lesson
   * @param {import('./audio-engine.js').AudioEngine} opts.audio
   */
  constructor(opts) {
    this._root = opts.root;
    this._lesson = opts.lesson;
    this._audio = opts.audio;
    /** @type {Array<() => void>} */
    this._cleanups = [];
    /** @type {WordDeck | null} */
    this._deck = null;
  }

  mount() {
    this.dispose();
    const root = this._root;
    const L = this._lesson;
    const audio = this._audio;

    const titleEl = root.querySelector('#title');
    const subtitleEl = root.querySelector('#subtitle');
    const lettersEl = root.querySelector('#letters');

    if (titleEl) titleEl.textContent = L.title;
    // Hide subtitle when it only repeats the lesson flow / title
    if (subtitleEl) {
      const sub = (L.subtitle || '').trim();
      const redundant =
        !sub ||
        /^sounds\s*→/i.test(sub) ||
        sub.toLowerCase() === (L.title || '').toLowerCase();
      subtitleEl.textContent = redundant ? '' : sub;
    }

    if (lettersEl) {
      lettersEl.innerHTML = '';
      L.sounds.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'item';
        const row = document.createElement('div');
        row.className = 'letter-row';
        const letter = document.createElement('div');
        letter.className = 'letter';
        letter.textContent = s.letter;
        const speakBtn = document.createElement('button');
        speakBtn.className = 'speak';
        speakBtn.type = 'button';
        speakBtn.textContent = '🔊';
        speakBtn.addEventListener('click', () => {
          audio.unlock();
          audio.play(s.key);
        });
        row.appendChild(letter);
        row.appendChild(speakBtn);

        const wrap = document.createElement('div');
        wrap.className = 'track-wrap';
        wrap.innerHTML =
          '<div class="track"></div><div class="dot"></div><div class="knob">➜</div>';
        const status = document.createElement('div');
        status.className = 'status';
        status.innerHTML = 'Say <strong>' + s.say + '</strong>';

        item.appendChild(row);
        item.appendChild(wrap);
        item.appendChild(status);
        lettersEl.appendChild(item);

        const cleanup = attachDragHold({
          trackWrap: wrap,
          statusEl: status,
          sound: s,
          audio,
        });
        this._cleanups.push(cleanup);
      });
    }

    const viewport = root.querySelector('#deck-viewport');
    const dotsEl = root.querySelector('#deck-dots');
    const prevBtn = root.querySelector('#deck-prev');
    const nextBtn = root.querySelector('#deck-next');
    const blendBtn = root.querySelector('#blend');

    this._deck = new WordDeck({
      builds: L.builds || [],
      blends: L.blends || [],
      viewport,
      dotsEl,
      prevBtn,
      nextBtn,
      blendBtn,
      audio,
    });
    this._deck.mount();
  }

  dispose() {
    for (const fn of this._cleanups) {
      try {
        fn();
      } catch (_) {}
    }
    this._cleanups = [];
    if (this._deck) {
      this._deck.dispose();
      this._deck = null;
    }
    const root = this._root;
    if (!root) return;
    const lettersEl = root.querySelector('#letters');
    if (lettersEl) lettersEl.innerHTML = '';
  }

  get lessonId() {
    return this._lesson.id;
  }
}
