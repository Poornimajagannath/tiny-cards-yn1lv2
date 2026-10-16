/**
 * WordDeck facade — openLibrary | openLesson | openFirstSound | playSound | closeLesson
 * Reading home only. NumberDeck is a separate app at /math/.
 */

import { Catalog } from './catalog.js';
import { AudioEngine } from './audio-engine.js';
import { LessonSession } from './lesson-session.js';
import { FocusSession } from './focus-session.js';
import { FirstSoundSession } from './first-sound-session.js';

/** @type {Catalog | null} */
let _catalog = null;
/** @type {AudioEngine | null} */
let _audio = null;
/** @type {LessonSession | null} */
let _session = null;
/** @type {FirstSoundSession | null} */
let _firstSound = null;
/** @type {{homeRoot:HTMLElement, lessonRoot:HTMLElement, firstSoundRoot?:HTMLElement, cardHost?:HTMLElement} | null} */
let _handles = null;
/** @type {FocusSession | null} */
let _focus = null;
let _booted = false;

function renderHomeCards() {
  if (!_handles || !_catalog) return;
  const host =
    _handles.cardHost ||
    _handles.homeRoot.querySelector('#cards') ||
    _handles.homeRoot;
  // Remove prior generated cards only (keep heading / notes)
  host.querySelectorAll('[data-lesson]').forEach((el) => el.remove());
  for (const summary of _catalog.listSummaries()) {
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.type = 'button';
    btn.setAttribute('data-lesson', summary.id);
    btn.innerHTML = `<h2>${summary.title}</h2><p>${summary.teaser}</p>`;
    btn.addEventListener('click', () => {
      _audio?.unlock();
      openLesson(summary.id);
    });
    host.appendChild(btn);
  }
}

/**
 * Boot: load catalog, wire unlock gestures, render home cards.
 * Idempotent after first successful boot.
 * @param {{homeRoot:HTMLElement, lessonRoot:HTMLElement, cardHost?:HTMLElement}} handles
 * @param {{curriculumUrl?: string}} [opts]
 */
export async function openLibrary(handles, opts = {}) {
  if (_booted && _catalog) {
    // Re-render cards if called again after boot (safe)
    renderHomeCards();
    return;
  }
  _handles = handles;
  _catalog = await Catalog.load(opts.curriculumUrl || './curriculum/lessons.json');
  _audio = new AudioEngine(_catalog);
  _focus = FocusSession.open({ catalog: _catalog });

  const unlock = () => _audio?.unlock();
  document.body.addEventListener('touchstart', unlock, { once: true });
  document.body.addEventListener('click', unlock, { once: true });

  const back = handles.lessonRoot.querySelector('#back');
  if (back && !back.dataset.wired) {
    back.dataset.wired = '1';
    back.addEventListener('click', () => closeLesson());
  }

  const fsOpen = handles.homeRoot.querySelector('#open-first-sound');
  if (fsOpen && !fsOpen.dataset.wired) {
    fsOpen.dataset.wired = '1';
    fsOpen.addEventListener('click', () => {
      _audio?.unlock();
      const id = _focus?.getFocusId() || '1';
      openFirstSound(id);
    });
  }

  const fsBack = handles.firstSoundRoot && handles.firstSoundRoot.querySelector('#fs-back');
  if (fsBack && !fsBack.dataset.wired) {
    fsBack.dataset.wired = '1';
    fsBack.addEventListener('click', () => closeLesson());
  }

  renderHomeCards();
  _booted = true;
}

/**
 * Open a lesson by id. Unknown id → no-op.
 * @param {string} lessonId
 */
export function openLesson(lessonId) {
  if (!_catalog || !_audio || !_handles) return;
  _audio.unlock();
  const lesson = _catalog.getLesson(lessonId);
  if (!lesson) return;

  _audio.stop();
  if (_session) {
    _session.dispose();
    _session = null;
  }
  if (_firstSound) {
    _firstSound.dispose();
    _firstSound = null;
  }

  _session = new LessonSession({
    root: _handles.lessonRoot,
    lesson,
    audio: _audio,
  });
  _session.mount();

  _showView('lesson');
}

/**
 * First-sound mode for a lesson (default 1 / today's focus).
 * @param {string} [lessonId]
 */
export function openFirstSound(lessonId) {
  if (!_catalog || !_audio || !_handles || !_handles.firstSoundRoot) return;
  _audio.unlock();
  const lesson = _catalog.getLesson(lessonId || '1') || _catalog.getLesson('1');
  if (!lesson) return;

  _audio.stop();
  if (_session) {
    _session.dispose();
    _session = null;
  }
  if (_firstSound) {
    _firstSound.dispose();
    _firstSound = null;
  }

  _firstSound = new FirstSoundSession({
    root: _handles.firstSoundRoot,
    lesson,
    audio: _audio,
    onClose: () => closeLesson(),
  });
  _firstSound.mount();
  _showView('first-sound');
}

function _showView(name) {
  if (!_handles) return;
  _handles.homeRoot.classList.toggle('hidden', name !== 'home');
  _handles.lessonRoot.classList.toggle('hidden', name !== 'lesson');
  if (_handles.firstSoundRoot) {
    _handles.firstSoundRoot.classList.toggle('hidden', name !== 'first-sound');
  }
}

/**
 * @param {string} key
 */
export function playSound(key) {
  if (!_audio) return;
  _audio.unlock();
  _audio.play(key);
}

/** Return to WordDeck home. */
export function closeLesson() {
  if (_audio) _audio.stop();
  if (_session) {
    _session.dispose();
    _session = null;
  }
  if (_firstSound) {
    _firstSound.dispose();
    _firstSound = null;
  }
  _showView('home');
}

/**
 * Apply deep-link and/or restore today's focus.
 * Call after openLibrary. Returns the lesson id opened, or null.
 * @param {string} [search=location.search]
 * @returns {string | null}
 */
export function applyFocusBoot(search) {
  if (!_focus || !_catalog) return null;
  const qsRaw = search != null ? search : typeof location !== 'undefined' ? location.search : '';
  const qs = new URLSearchParams(qsRaw.startsWith('?') ? qsRaw.slice(1) : qsRaw);
  if (qs.get('mode') === 'first-sound') {
    const id = _focus.getFocusId() || '1';
    openFirstSound(id);
    return id;
  }
  const result = _focus.applyDeepLink(qsRaw);
  if (result.applied && result.id) {
    openLesson(result.id);
    return result.id;
  }
  // No query — if focus already set, open that lesson (Today-first)
  const focused = _focus.getFocusId();
  if (focused) {
    openLesson(focused);
    return focused;
  }
  return null;
}

/** @returns {FocusSession | null} */
export function getFocusSession() {
  return _focus;
}
