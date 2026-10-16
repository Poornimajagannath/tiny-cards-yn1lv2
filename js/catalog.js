/**
 * Catalog — single curriculum truth + SoundKey → path policy.
 * Hides: JSON fetch, wire validation, blend derivation, path convention, summaries.
 */

/**
 * Pure: derive blend cues from builds when wire omits blends.
 * @param {{label:string, key:string}[]} builds
 * @returns {{label:string, key:string}[]}
 */
export function deriveBlends(builds) {
  return (builds || []).map((b) => ({
    label: b.label,
    key: `${b.key}_blend`,
  }));
}

/**
 * Pure: teaser line from builds for home cards.
 * @param {{builds:{label:string}[]}} lesson
 * @returns {string}
 */
export function summaryTeaser(lesson) {
  return (lesson.builds || []).map((b) => b.label).join(' · ');
}

/**
 * Pure: wire → domain Map. Throws on missing title/sounds/builds/script.
 * @param {Record<string, object>} wire
 * @returns {Map<string, object>}
 */
export function parseCurriculumWire(wire) {
  if (!wire || typeof wire !== 'object' || Array.isArray(wire)) {
    throw new Error('curriculum wire must be an object map');
  }
  const map = new Map();
  for (const [rawId, raw] of Object.entries(wire)) {
    const id = String(rawId);
    if (!raw || typeof raw !== 'object') {
      throw new Error(`lesson ${id}: invalid entry`);
    }
    if (!raw.title || typeof raw.title !== 'string') {
      throw new Error(`lesson ${id}: missing title`);
    }
    if (!Array.isArray(raw.sounds) || raw.sounds.length === 0) {
      throw new Error(`lesson ${id}: sounds required`);
    }
    if (!Array.isArray(raw.builds) || raw.builds.length === 0) {
      throw new Error(`lesson ${id}: builds required`);
    }
    if (!Array.isArray(raw.script) || raw.script.length === 0) {
      throw new Error(`lesson ${id}: script required`);
    }
    for (const s of raw.sounds) {
      if (!s || !s.letter || !s.key) throw new Error(`lesson ${id}: bad sound`);
    }
    for (const b of raw.builds) {
      if (!b || !b.label || !b.key || typeof b.parts !== 'string') {
        throw new Error(`lesson ${id}: bad build`);
      }
    }
    const blends =
      Array.isArray(raw.blends) && raw.blends.length > 0
        ? raw.blends.map((b) => {
            if (!b || !b.label || !b.key) throw new Error(`lesson ${id}: bad blend`);
            return { label: b.label, key: String(b.key) };
          })
        : deriveBlends(raw.builds);

    map.set(id, {
      id,
      title: raw.title,
      subtitle: raw.subtitle || '',
      sounds: raw.sounds.map((s) => ({
        letter: s.letter,
        say: s.say || s.letter,
        key: String(s.key),
      })),
      builds: raw.builds.map((b) => ({
        label: b.label,
        key: String(b.key),
        parts: b.parts,
      })),
      blends,
      script: raw.script.map(String),
    });
  }
  return map;
}

export class Catalog {
  /** @param {Map<string, object>} lessons */
  constructor(lessons) {
    this._lessons = lessons;
  }

  /**
   * @param {string} [url='./curriculum/lessons.json']
   * @returns {Promise<Catalog>}
   */
  static async load(url = './curriculum/lessons.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load curriculum: ${res.status}`);
    const wire = await res.json();
    return Catalog.fromWire(wire);
  }

  /** @param {Record<string, object>} wire */
  static fromWire(wire) {
    return new Catalog(parseCurriculumWire(wire));
  }

  /** @returns {{id:string, title:string, teaser:string}[]} */
  listSummaries() {
    return [...this._lessons.values()]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        teaser: summaryTeaser(lesson),
      }));
  }

  /**
   * @param {string} rawId
   * @returns {object | null}
   */
  getLesson(rawId) {
    if (rawId == null) return null;
    const id = String(rawId).replace(/^L/i, '').replace(/^lesson-?/i, '');
    return this._lessons.get(id) || null;
  }

  /**
   * Resolve SoundKey → relative URL. Owns blendrep naming quirk.
   * @param {string} key
   * @returns {string | null}
   */
  urlFor(key) {
    if (!key || typeof key !== 'string') return null;
    if (key.endsWith('_blend')) {
      const stem = key.slice(0, -'_blend'.length);
      if (!stem) return null;
      return `sounds/${stem}_blendrep.mp3`;
    }
    return `sounds/${key}.mp3`;
  }

  /** @param {string} key */
  hasSound(key) {
    return this.urlFor(key) != null;
  }
}
