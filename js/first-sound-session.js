/**
 * FirstSoundSession — hear a WordDeck word, tap the letter it starts with.
 * One lesson: today's focus, else lesson 1.
 */

import { SitSession } from './sit-session.js';
import { makeRound } from './first-sound-core.js';

export class FirstSoundSession {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.root
   * @param {object} opts.lesson
   * @param {import('./audio-engine.js').AudioEngine} opts.audio
   * @param {() => void} [opts.onClose]
   */
  constructor(opts) {
    this._root = opts.root;
    this._lesson = opts.lesson;
    this._audio = opts.audio;
    this._onClose = opts.onClose;
    this._sit = new SitSession({ domain: 'reading', mode: 'first-sound' });
    this._round = null;
    this._lastKey = null;
    this._locked = false;
    this._cleanups = [];
    this._advanceTimer = null;
    this._disposed = false;
  }

  mount() {
    this.dispose();
    this._disposed = false;
    this._sit = new SitSession({ domain: 'reading', mode: 'first-sound' });
    this._renderChrome();
    this._nextRound();
  }

  _renderChrome() {
    const root = this._root;
    const title = root.querySelector('#fs-title');
    const sub = root.querySelector('#fs-sub');
    if (title) title.textContent = 'First sound';
    if (sub) {
      sub.textContent = this._lesson.title
        ? 'Hear the word. Tap the letter it starts with. ' + this._lesson.title
        : 'Hear the word. Tap the letter it starts with.';
    }

    const done = root.querySelector('#fs-done');
    if (done) {
      const onDone = () => this._showEnough(true);
      done.addEventListener('click', onDone);
      this._cleanups.push(() => done.removeEventListener('click', onDone));
    }
  }

  _nextRound() {
    this._locked = false;
    const enough = this._root.querySelector('#fs-enough');
    if (enough) enough.classList.add('hidden');
    const play = this._root.querySelector('#fs-play');
    if (play) play.classList.remove('hidden');
    const bar = this._root.querySelector('.sit-bar');
    if (bar) bar.classList.remove('hidden');

    this._round = makeRound(this._lesson, this._lastKey);
    if (!this._round) return;
    this._lastKey = this._round.build.key;
    this._paintRound();
    this._audio.unlock();
    this._audio.play(this._round.build.key);
    this._updateSit();
  }

  _paintRound() {
    const round = this._round;
    const wordEl = this._root.querySelector('#fs-word');
    const prompt = this._root.querySelector('#fs-prompt');
    const letters = this._root.querySelector('#fs-letters');
    const status = this._root.querySelector('#fs-status');
    if (!round || !letters) return;

    if (wordEl) wordEl.textContent = round.build.label;
    if (status) status.innerHTML = 'What sound first?';

    const playWord = (e) => {
      if (e) e.stopPropagation();
      this._audio.unlock();
      this._audio.play(round.build.key);
    };
    if (prompt) {
      prompt.onclick = playWord;
    }
    const speak = this._root.querySelector('#fs-speak');
    if (speak) speak.onclick = playWord;

    letters.innerHTML = '';
    round.choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fs-letter';
      btn.textContent = choice.letter;
      btn.setAttribute('aria-label', 'Letter ' + choice.letter);
      btn.addEventListener('click', () => this._pick(choice, btn));
      letters.appendChild(btn);
    });
  }

  _pick(choice, btn) {
    if (this._locked || !this._round) return;
    this._audio.unlock();
    const ok = choice.key === this._round.firstKey;
    this._sit.mark(ok);
    const status = this._root.querySelector('#fs-status');

    if (!ok) {
      this._audio.play(this._round.firstKey);
      if (status) {
        const say = this._sayFor(this._round.firstKey);
        status.innerHTML = 'Hear <strong>' + say + '</strong>. Try again.';
      }
      this._updateSit();
      return;
    }

    this._locked = true;
    btn.classList.add('yes');
    this._root.querySelectorAll('.fs-letter').forEach((el) => {
      el.disabled = true;
    });
    this._audio.play(choice.key);
    if (status) {
      status.innerHTML =
        '<strong>' +
        (choice.say || choice.letter) +
        '</strong> — ' +
        this._round.build.label;
    }
    this._updateSit();
    this._clearAdvanceTimer();
    const id = window.setTimeout(() => {
      if (this._advanceTimer !== id || this._disposed) return;
      this._advanceTimer = null;
      if (this._sit.burstComplete()) this._showEnough(false);
      else this._nextRound();
    }, 900);
    this._advanceTimer = id;
  }

  _sayFor(key) {
    const s = (this._lesson.sounds || []).find((x) => x.key === key);
    return (s && (s.say || s.letter)) || key;
  }

  _updateSit() {
    const dots = this._root.querySelector('#fs-sit-label');
    if (dots) dots.textContent = this._sit.label();
  }

  _clearAdvanceTimer() {
    if (this._advanceTimer) {
      window.clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
  }

  /** @param {boolean} fromParent */
  _showEnough(fromParent) {
    this._clearAdvanceTimer();
    this._sit.end();
    this._audio.stop();
    const play = this._root.querySelector('#fs-play');
    const enough = this._root.querySelector('#fs-enough');
    const copy = this._root.querySelector('#fs-enough-copy');
    if (play) play.classList.add('hidden');
    if (enough) enough.classList.remove('hidden');
    const bar = this._root.querySelector('.sit-bar');
    if (bar) bar.classList.add('hidden');
    if (copy) {
      copy.textContent = fromParent
        ? 'Stopped when she stopped. That is the sit.'
        : 'Five is plenty. Walk away or do a few more.';
    }
    const keep = this._root.querySelector('#fs-keep');
    const home = this._root.querySelector('#fs-home');
    if (keep) keep.onclick = () => {
      this._sit = new SitSession({ domain: 'reading', mode: 'first-sound' });
      this._nextRound();
    };
    if (home) home.onclick = () => {
      if (this._onClose) this._onClose();
    };
  }

  dispose() {
    this._disposed = true;
    this._clearAdvanceTimer();
    this._audio.stop();
    for (const fn of this._cleanups) {
      try {
        fn();
      } catch (_) {}
    }
    this._cleanups = [];
    const letters = this._root.querySelector('#fs-letters');
    if (letters) letters.innerHTML = '';
  }
}
