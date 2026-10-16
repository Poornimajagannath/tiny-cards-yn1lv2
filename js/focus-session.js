/**
 * FocusSession — today's lesson via localStorage; deep-link ?focus= / ?lesson=.
 * Grafted from Candidate C. No auto-advance after mark-done.
 * Persistence schema stays private to this module.
 */

const DEFAULT_KEY = 'samaya.focus.v1';

function todayStamp() {
  // Device-local calendar day (box/user zone is America/Los_Angeles)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyState() {
  return {
    v: 1,
    lessonId: null,
    setAt: null,
    doneToday: false,
    doneTodayStamp: null,
    doneFlags: {},
    streakDays: 0,
    lastSitDate: null,
  };
}

function readState(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return emptyState();
    return {
      ...emptyState(),
      ...parsed,
      doneFlags: parsed.doneFlags && typeof parsed.doneFlags === 'object' ? parsed.doneFlags : {},
    };
  } catch (_) {
    return emptyState();
  }
}

function rollDoneToday(state, today) {
  if (state.doneTodayStamp !== today) {
    state.doneToday = false;
    state.doneTodayStamp = null;
  }
}

export class FocusSession {
  /**
   * @param {Object} deps
   * @param {{getLesson:(id:string)=>object|null}} deps.catalog
   * @param {Storage} [deps.storage]
   * @param {() => string} [deps.today]
   * @param {string} [deps.storageKey]
   */
  constructor(deps, state) {
    this._catalog = deps.catalog;
    this._storage = deps.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this._today = deps.today || todayStamp;
    this._key = deps.storageKey || DEFAULT_KEY;
    this._state = state;
  }

  /**
   * @param {Object} deps
   * @returns {FocusSession}
   */
  static open(deps) {
    const storage = deps.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const key = deps.storageKey || DEFAULT_KEY;
    const today = deps.today || todayStamp;
    const state = storage ? readState(storage, key) : emptyState();
    rollDoneToday(state, today());
    return new FocusSession({ ...deps, storage, today, storageKey: key }, state);
  }

  _persist() {
    if (!this._storage) return;
    try {
      this._storage.setItem(this._key, JSON.stringify(this._state));
    } catch (_) {
      /* quota / private mode */
    }
  }

  snapshot() {
    const id = this._state.lessonId;
    const lesson = id ? this._catalog.getLesson(id) : null;
    return {
      lessonId: lesson ? lesson.id : id,
      lesson,
      doneToday: !!this._state.doneToday,
      streakDays: this._state.streakDays || 0,
      doneFlags: { ...(this._state.doneFlags || {}) },
      setAt: this._state.setAt,
    };
  }

  /**
   * @param {string} id
   * @returns {boolean} true if set
   */
  setFocus(id) {
    const lesson = this._catalog.getLesson(id);
    if (!lesson) return false;
    if (this._state.lessonId === lesson.id) {
      // Idempotent same id — still refresh setAt lightly? keep as-is for same id
      return true;
    }
    this._state.lessonId = lesson.id;
    this._state.setAt = new Date().toISOString();
    this._state.doneToday = false;
    this._state.doneTodayStamp = null;
    this._persist();
    return true;
  }

  clearFocus() {
    this._state.lessonId = null;
    this._state.setAt = null;
    this._state.doneToday = false;
    this._state.doneTodayStamp = null;
    this._persist();
  }

  /**
   * Optional end-of-sit flag. Never auto-advances focus.
   */
  markSitDone() {
    const id = this._state.lessonId;
    if (!id) return;
    const today = this._today();
    if (this._state.doneToday && this._state.lastSitDate === today) return;

    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

    if (this._state.lastSitDate === today) {
      /* keep streak */
    } else if (this._state.lastSitDate === yesterday) {
      this._state.streakDays = (this._state.streakDays || 0) + 1;
    } else {
      this._state.streakDays = 1;
    }

    this._state.doneToday = true;
    this._state.doneTodayStamp = today;
    this._state.lastSitDate = today;
    this._state.doneFlags[id] = today;
    this._persist();
  }

  /**
   * Parse ?focus=8 or ?lesson=8 (also L8 / lesson-8).
   * When valid, setFocus. Returns { applied, id }.
   * @param {string} search
   */
  applyDeepLink(search) {
    const qs =
      typeof search === 'string'
        ? new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
        : new URLSearchParams(search);
    const raw = qs.get('focus') || qs.get('lesson');
    if (!raw) return { applied: false, id: null };
    const lesson = this._catalog.getLesson(raw);
    if (!lesson) return { applied: false, id: null };
    const changed = this._state.lessonId !== lesson.id;
    this.setFocus(lesson.id);
    return { applied: true, id: lesson.id, changed };
  }

  /** Current focused lesson id, or null. */
  getFocusId() {
    const snap = this.snapshot();
    // If curriculum no longer has the id, treat as unset for boot
    if (this._state.lessonId && !snap.lesson) return null;
    return snap.lessonId;
  }
}
