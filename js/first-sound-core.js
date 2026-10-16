/**
 * First-sound rounds from a WordDeck lesson.
 * Print stays letters-only. No pictures.
 */

/**
 * First grapheme from teacher parts ("/m/ /a/ /t/" → "m"), else the written first letter.
 * @param {{label?: string, parts?: string}} build
 * @returns {string | null}
 */
export function firstSound(build) {
  if (!build) return null;
  const token = String(build.parts || '')
    .trim()
    .split(/\s+/)
    .find(Boolean);
  if (token) {
    const g = token.replace(/\//g, '').toLowerCase();
    if (g) return g;
  }
  const label = String(build.label || '').trim();
  return label ? label[0].toLowerCase() : null;
}

/**
 * Two (or fewer) big letter choices. Correct plus one other from the same lesson.
 * @param {{letter:string, say?:string, key:string}[]} sounds
 * @param {string} correctKey
 * @param {() => number} [rand]
 */
export function letterChoices(sounds, correctKey, rand = Math.random) {
  const unique = [];
  const seen = new Set();
  for (const s of sounds || []) {
    const key = String(s.key || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      letter: s.letter,
      say: s.say || s.letter,
      key,
    });
  }
  const want = String(correctKey || '').toLowerCase();
  const correct = unique.find((s) => s.key === want);
  if (!correct) return [];
  const others = unique.filter((s) => s.key !== correct.key);
  if (!others.length) return [correct];
  const pick = others[Math.floor(rand() * others.length)];
  const pair = [correct, pick];
  if (rand() < 0.5) pair.reverse();
  return pair;
}

/**
 * Sound keys present on a lesson (the letters the child can tap).
 * @param {{key?: string}[]} sounds
 * @returns {Set<string>}
 */
export function soundKeySet(sounds) {
  const keys = new Set();
  for (const s of sounds || []) {
    const key = String(s.key || '').toLowerCase();
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Next build that has a first sound in the lesson's letter set, avoiding the last word when possible.
 * @param {{label:string, key:string, parts?:string}[]} builds
 * @param {string | null} lastKey
 * @param {() => number} [rand]
 * @param {Set<string> | null} [allowedKeys]  if set, firstSound must be in this set
 */
export function nextBuild(builds, lastKey, rand = Math.random, allowedKeys = null) {
  const usable = (builds || []).filter((b) => {
    const first = firstSound(b);
    if (!first || !b.key) return false;
    if (allowedKeys && !allowedKeys.has(first)) return false;
    return true;
  });
  if (!usable.length) return null;
  const pool = usable.length > 1 ? usable.filter((b) => b.key !== lastKey) : usable;
  return pool[Math.floor(rand() * pool.length)] || usable[0];
}

/**
 * @param {object} lesson
 * @param {string | null} lastKey
 * @param {() => number} [rand]
 */
export function makeRound(lesson, lastKey, rand = Math.random) {
  if (!lesson) return null;
  const allowed = soundKeySet(lesson.sounds);
  const build = nextBuild(lesson.builds, lastKey, rand, allowed);
  if (!build) return null;
  const key = firstSound(build);
  const choices = letterChoices(lesson.sounds, key, rand);
  if (!key || !choices.some((c) => c.key === key)) return null;
  return { build, firstKey: key, choices };
}
