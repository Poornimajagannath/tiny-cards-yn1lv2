/**
 * NumberDeck shell — Look (1–10 towers), Count (1:1), Together (early +).
 */

import { Voice, numberWord } from '../../js/speech.js';
import { SitSession } from '../../js/sit-session.js';
import { DIGITS, FACTS, renderTower } from './blocks.js';

const SWIPE_THRESHOLD = 50;
const TAP_SLOP = 12;

export class NumberApp {
  /**
   * @param {{ root: HTMLElement }} opts
   */
  constructor(opts) {
    this._root = opts.root;
    this._voice = new Voice();
    this._mode = 'home';
    this._lookIndex = 0;
    this._countGoal = 1;
    this._countHave = 0;
    this._factIndex = 0;
    this._joined = false;
    this._sit = null;
    this._animating = false;
    this._lookMouse = null;
    this._countLocked = false;
    this._lookSuppressClick = false;
    this._lookSuppressTimer = null;
    this._countTimer = null;
  }

  boot(search) {
    const qs = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const mode = qs.get('mode');
    this._wireHome();
    if (mode === 'look' || mode === 'count' || mode === 'together') {
      this.openMode(mode);
    } else {
      this.showHome();
    }
  }

  _wireHome() {
    this._root.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this._voice.unlock();
        this.openMode(el.getAttribute('data-mode'));
      });
    });
    const back = this._root.querySelector('#mode-back');
    if (back) {
      back.addEventListener('click', () => {
        this._voice.stop();
        this.showHome();
      });
    }
    const done = this._root.querySelector('#math-done');
    if (done) done.addEventListener('click', () => this._showEnough(true));
    const keep = this._root.querySelector('#math-keep');
    if (keep) keep.addEventListener('click', () => this._resume());
    const home = this._root.querySelector('#math-home');
    if (home) home.addEventListener('click', () => this.showHome());
  }

  showHome() {
    this._clearCountTimer();
    this._clearLookSuppress();
    this._mode = 'home';
    this._voice.stop();
    this._root.querySelector('#home').classList.remove('hidden');
    this._root.querySelector('#mode').classList.add('hidden');
  }

  /**
   * @param {'look'|'count'|'together'} mode
   * @param {{ reset?: boolean }} [opts]
   */
  openMode(mode, opts = {}) {
    this._clearCountTimer();
    this._clearLookSuppress();
    const reset = opts.reset !== false;
    this._voice.unlock();
    this._mode = mode;
    this._sit = new SitSession({ domain: 'math', mode });
    this._root.querySelector('#home').classList.add('hidden');
    this._root.querySelector('#mode').classList.remove('hidden');
    this._root.querySelector('#math-enough').classList.add('hidden');
    this._root.querySelector('#math-play').classList.remove('hidden');
    const bar = this._root.querySelector('.sit-bar');
    if (bar) bar.classList.remove('hidden');
    if (mode === 'look') {
      if (reset) this._lookIndex = 0;
      this._mountLook();
    } else if (mode === 'count') {
      if (reset) {
        this._countGoal = 1;
        this._countHave = 0;
      }
      this._countLocked = false;
      this._mountCount();
    } else {
      if (reset) {
        this._factIndex = 0;
        this._joined = false;
      }
      this._mountTogether();
    }
    this._updateSit();
  }

  _setTitle(title, sub) {
    const t = this._root.querySelector('#mode-title');
    const s = this._root.querySelector('#mode-sub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub;
  }

  _playEl() {
    return this._root.querySelector('#math-play');
  }

  _mountLook() {
    this._setTitle('Look', 'Digit and blocks. Tap to hear. Swipe for the next.');
    const play = this._playEl();
    play.innerHTML =
      '<div class="deck" id="look-deck">' +
      '<div class="deck-viewport" id="look-viewport"></div>' +
      '<div class="deck-nav">' +
      '<button type="button" class="deck-chev" id="look-prev" aria-label="Previous">‹</button>' +
      '<div class="deck-dots" id="look-dots"></div>' +
      '<button type="button" class="deck-chev" id="look-next" aria-label="Next">›</button>' +
      '</div></div>' +
      '<p class="hint">1–5 first. Keep swiping for 6–10.</p>';
    this._renderLookCard(null);
    this._renderLookDots();
    this._wireLookNav();
  }

  _renderLookCard(enterFrom) {
    const viewport = this._root.querySelector('#look-viewport');
    if (!viewport) return;
    const n = DIGITS[this._lookIndex];
    const card = document.createElement('div');
    card.className = 'deck-card look-card';
    if (enterFrom === 'left') card.classList.add('swipe-in-from-left');
    if (enterFrom === 'right') card.classList.add('swipe-in-from-right');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Number ' + n);

    const speak = document.createElement('button');
    speak.type = 'button';
    speak.className = 'deck-speak';
    speak.setAttribute('aria-label', 'Say number');
    speak.textContent = '🔊';

    const digit = document.createElement('div');
    digit.className = 'digit';
    digit.textContent = String(n);

    const tower = document.createElement('div');
    renderTower(tower, n);

    card.appendChild(speak);
    card.appendChild(digit);
    card.appendChild(tower);
    viewport.innerHTML = '';
    viewport.appendChild(card);

    const play = (e) => {
      if (e) e.stopPropagation();
      if (this._lookSuppressClick) {
        this._lookSuppressClick = false;
        return;
      }
      this._voice.unlock();
      this._speakLook();
      this._sit.mark(true);
      this._updateSit();
      if (this._sit.burstComplete()) this._showEnough(false);
    };
    speak.addEventListener('click', play);
    card.addEventListener('click', (e) => {
      if (e.target === speak || speak.contains(e.target)) return;
      play(e);
    });
  }

  _speakLook() {
    const n = DIGITS[this._lookIndex];
    this._voice.speak(numberWord(n));
  }

  _renderLookDots() {
    const dotsEl = this._root.querySelector('#look-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    DIGITS.forEach((n, i) => {
      const s = document.createElement('span');
      if (i === this._lookIndex) s.className = 'on';
      if (n > 5) s.classList.add('stretch');
      dotsEl.appendChild(s);
    });
    const prev = this._root.querySelector('#look-prev');
    const next = this._root.querySelector('#look-next');
    if (prev) prev.disabled = this._lookIndex <= 0;
    if (next) next.disabled = this._lookIndex >= DIGITS.length - 1;
  }

  _lookGo(delta) {
    if (this._animating) return;
    const next = this._lookIndex + delta;
    if (next < 0 || next >= DIGITS.length) return;
    const card = this._root.querySelector('#look-viewport .deck-card');
    const outClass = delta > 0 ? 'swipe-out-left' : 'swipe-out-right';
    const enterFrom = delta > 0 ? 'right' : 'left';
    this._animating = true;
    const done = () => {
      this._lookIndex = next;
      this._renderLookCard(enterFrom);
      this._renderLookDots();
      this._animating = false;
      this._clearLookSuppress();
    };
    if (card) {
      card.classList.remove('swipe-in-from-left', 'swipe-in-from-right');
      card.classList.add(outClass);
      window.setTimeout(done, 260);
    } else {
      done();
    }
  }

  _wireLookNav() {
    const prev = this._root.querySelector('#look-prev');
    const next = this._root.querySelector('#look-next');
    if (prev) prev.addEventListener('click', () => this._lookGo(-1));
    if (next) next.addEventListener('click', () => this._lookGo(1));
    this._wireSwipe(this._root.querySelector('#look-viewport'), (d) => this._lookGo(d));
  }

  _wireSwipe(el, go) {
    if (!el) return;
    if (this._lookMouse) {
      window.removeEventListener('mousemove', this._lookMouse.move);
      window.removeEventListener('mouseup', this._lookMouse.up);
      this._lookMouse = null;
    }
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let axis = null;
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
        this._lookSuppressClick = true;
        if (this._lookSuppressTimer) window.clearTimeout(this._lookSuppressTimer);
        this._lookSuppressTimer = window.setTimeout(() => {
          this._lookSuppressClick = false;
          this._lookSuppressTimer = null;
        }, 500);
        if (dx < 0) go(1);
        else go(-1);
        if (e.cancelable) e.preventDefault();
      }
      axis = null;
      moved = false;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    let mouseDown = false;
    el.addEventListener('mousedown', (e) => {
      mouseDown = true;
      onStart(e);
    });
    const move = (e) => {
      if (mouseDown) onMove(e);
    };
    const up = (e) => {
      if (!mouseDown) return;
      mouseDown = false;
      onEnd(e);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this._lookMouse = { move, up };
  }

  _mountCount() {
    this._setTitle('Count', 'One tap, one block. Take one away if you want.');
    this._paintCount();
  }

  _paintCount() {
    const play = this._playEl();
    const n = this._countGoal;
    play.innerHTML =
      '<div class="count-head"><div class="digit" id="count-digit">' +
      n +
      '</div><p class="hint" id="count-hint">Make ' +
      numberWord(n) +
      '</p></div>' +
      '<div class="tray" id="count-tray"><div id="count-tower"></div></div>' +
      '<button type="button" class="add-one" id="count-add">Add one</button>';
    const tower = play.querySelector('#count-tower');
    renderTower(tower, this._countHave, {
      interactive: true,
      onRemove: () => this._countDelta(-1),
    });
    play.querySelector('#count-add').addEventListener('click', () => this._countDelta(1));
    play.querySelector('#count-tray').addEventListener('click', (e) => {
      if (e.target.closest('.block')) return;
      this._countDelta(1);
    });
  }

  _countDelta(delta) {
    if (this._countLocked) return;
    this._voice.unlock();
    const next = this._countHave + delta;
    if (next < 0) return;
    if (next > this._countGoal) {
      this._voice.speak(numberWord(this._countHave));
      return;
    }
    const matched = next === this._countGoal && next > 0;
    if (matched) this._countLocked = true;
    this._countHave = next;
    const tower = this._root.querySelector('#count-tower');
    renderTower(tower, this._countHave, {
      interactive: !this._countLocked,
      onRemove: () => this._countDelta(-1),
    });
    if (this._countHave === 0) {
      this._voice.speak('none');
      return;
    }
    this._voice.speak(numberWord(this._countHave));
    if (matched) {
      const add = this._root.querySelector('#count-add');
      if (add) add.disabled = true;
      this._sit.mark(true);
      this._updateSit();
      this._clearCountTimer();
      this._countTimer = window.setTimeout(() => {
        this._countTimer = null;
        this._countLocked = false;
        if (this._sit.ended || this._mode !== 'count') return;
        this._countGoal = this._countGoal >= 10 ? 1 : this._countGoal + 1;
        this._countHave = 0;
        if (this._sit.burstComplete()) this._showEnough(false);
        else this._paintCount();
      }, 1100);
    }
  }

  _mountTogether() {
    this._setTitle('Together', 'Two groups. Put them together. That is the new number.');
    this._joined = false;
    this._paintTogether();
  }

  _paintTogether() {
    const fact = FACTS[this._factIndex];
    const play = this._playEl();
    if (this._joined) {
      const total = fact[0] + fact[1];
      play.innerHTML =
        '<div class="together joined">' +
        '<div class="digit">' +
        total +
        '</div>' +
        '<div id="sum-tower"></div>' +
        '<p class="hint">' +
        fact[0] +
        ' and ' +
        fact[1] +
        ' is ' +
        total +
        '</p>' +
        '<button type="button" class="add-one" id="together-next">Next</button>' +
        '</div>';
      renderTower(play.querySelector('#sum-tower'), total);
      play.querySelector('#together-next').addEventListener('click', () => {
        this._factIndex = (this._factIndex + 1) % FACTS.length;
        this._joined = false;
        if (this._sit.burstComplete()) this._showEnough(false);
        else this._paintTogether();
      });
      return;
    }
    play.innerHTML =
      '<div class="together">' +
      '<div class="group"><div class="digit mini">' +
      fact[0] +
      '</div><div id="left-tower"></div></div>' +
      '<div class="and">and</div>' +
      '<div class="group"><div class="digit mini">' +
      fact[1] +
      '</div><div id="right-tower"></div></div>' +
      '</div>' +
      '<button type="button" class="add-one" id="together-go">Together</button>';
    renderTower(play.querySelector('#left-tower'), fact[0]);
    renderTower(play.querySelector('#right-tower'), fact[1]);
    play.querySelector('#together-go').addEventListener('click', () => {
      this._voice.unlock();
      const total = fact[0] + fact[1];
      this._voice.speak(
        numberWord(fact[0]) + ' and ' + numberWord(fact[1]) + ' is ' + numberWord(total)
      );
      this._joined = true;
      this._sit.mark(true);
      this._updateSit();
      this._paintTogether();
    });
  }

  _updateSit() {
    const el = this._root.querySelector('#math-sit-label');
    if (el) el.textContent = this._sit ? this._sit.label() : '';
  }

  _clearCountTimer() {
    if (this._countTimer) {
      window.clearTimeout(this._countTimer);
      this._countTimer = null;
    }
  }

  _clearLookSuppress() {
    this._lookSuppressClick = false;
    if (this._lookSuppressTimer) {
      window.clearTimeout(this._lookSuppressTimer);
      this._lookSuppressTimer = null;
    }
  }

  _showEnough(fromParent) {
    this._clearCountTimer();
    this._clearLookSuppress();
    if (this._sit) this._sit.end();
    this._voice.stop();
    this._root.querySelector('#math-play').classList.add('hidden');
    const enough = this._root.querySelector('#math-enough');
    enough.classList.remove('hidden');
    const bar = this._root.querySelector('.sit-bar');
    if (bar) bar.classList.add('hidden');
    const copy = this._root.querySelector('#math-enough-copy');
    if (copy) {
      copy.textContent = fromParent
        ? 'Stopped when she stopped. That is the sit.'
        : 'Five is plenty. Walk away or do a few more.';
    }
  }

  _resume() {
    const mode = this._mode === 'home' ? 'look' : this._mode;
    this.openMode(mode, { reset: false });
  }
}
