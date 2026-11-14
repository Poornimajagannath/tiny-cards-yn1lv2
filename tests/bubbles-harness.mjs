/**
 * Phone harness for the Ane mango bubble screen on blocks.html.
 *
 * Makes real: Chromium at 390×844, story skip, friend pick, wrong and
 * right taps, the 5/5 win line, and the untouched tower script.
 * Records speechSynthesis text. Does not hear the speaker. WebAudio
 * unlock is counted, not listened to.
 *
 *   node tests/bubbles-harness.mjs
 * Chrome: /usr/bin/google-chrome or CHROME_PATH.
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, mkdir, copyFile } from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
const shots = join(artifacts, 'bubbles');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function firstScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('no script');
  return match[1];
}

const now = await readFile(join(root, 'blocks.html'), 'utf8');
const committed = execSync('git show HEAD:blocks.html', { cwd: root, encoding: 'utf8' });
assert(firstScript(now) === firstScript(committed), 'tower script changed');
assert(now.includes('Ane the baby elephant lost her 5 mangoes'), 'story missing');
assert(now.includes('STORY_MS = 10000'), 'story is not 10 seconds');
assert(now.includes("name: 'Ziggy'"), 'Ziggy missing');
assert(!now.includes('Pup') && !now.includes('Meenu'), 'old friend names remain');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = (urlPath === '/' ? 'blocks.html' : urlPath.replace(/^\/+/, ''));
  if (rel.includes('..')) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  if (rel === 'blocks.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(now);
    return;
  }
  const file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  recordVideo: { dir: '/tmp/bubbles-video', size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const requests = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('request', (req) => requests.push(req.url()));

await page.addInitScript(() => {
  window.__utters = [];
  window.__audioResumes = 0;
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (Orig) {
    const Wrapped = function AudioContextWrapped() {
      const ctx = new Orig();
      const resume = ctx.resume.bind(ctx);
      ctx.resume = () => {
        window.__audioResumes += 1;
        return resume();
      };
      return ctx;
    };
    Wrapped.prototype = Orig.prototype;
    window.AudioContext = Wrapped;
    window.webkitAudioContext = Wrapped;
  }
  const synth = window.speechSynthesis;
  if (synth && !synth.__blocksWrapped) {
    const orig = synth.speak.bind(synth);
    synth.speak = function (utterance) {
      window.__utters.push({ text: utterance.text, lang: utterance.lang });
      try { return orig(utterance); } catch (err) { /* speaker is optional */ }
    };
    synth.__blocksWrapped = true;
  }
});

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function utters() {
  return page.evaluate(() => window.__utters.map((u) => u.text));
}
async function shot(name) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: join(shots, name) });
  await pause(500);
}
async function box(selector) {
  const r = await page.locator(selector).first().boundingBox();
  assert(r, selector + ' missing');
  return r;
}

try {
  await page.goto(origin + '/blocks.html', { waitUntil: 'load' });
  assert((await page.locator('#numeral').textContent()) === '1', 'tower still opens on 1');
  assert(await page.locator('#blocks .cube').count() === 1, 'one tower block');
  assert(await page.locator('#mango-open').isHidden(), 'mango entry hidden on 1');
  await page.locator('#add-one').click();
  assert((await page.locator('#numeral').textContent()) === '2', 'add one still makes 2');
  assert((await page.locator('#said').textContent()) === '1 and 1 make 2', 'tower sentence unchanged');
  await shot('tower-unchanged.png');
  for (let i = 0; i < 4; i++) await page.locator('#next').click();
  assert(await page.locator('#screen-together').count() === 1, 'together still there');
  assert(await page.locator('#mango-open').isVisible(), 'entry on together');
  const entry = await box('#mango-open');
  assert(entry.width >= 88 && entry.height >= 88, 'entry smaller than 88 ' + entry.width + 'x' + entry.height);
  await shot('entry-together.png');

  await page.locator('#mango-open').click();
  await pause(200);
  assert(await page.locator('#mango-story').isVisible(), 'story visible');
  assert((await page.locator('#mango-story-text').textContent()).includes('Ane the baby elephant'), 'story copy');
  const said = await utters();
  assert(said.some((t) => t.includes('Ane the baby elephant lost her 5 mangoes')), 'story spoken ' + said.join(' | '));
  assert((await page.evaluate(() => window.__audioResumes)) >= 1, 'audio not unlocked on first tap');
  await shot('story.png');
  const skip = await box('#mango-skip');
  assert(skip.height >= 88, 'skip small');
  await page.locator('#mango-skip').click();
  await pause(200);
  assert(await page.locator('#mango-pick').isVisible(), 'pick after skip');
  assert(await page.locator('.friend').count() === 3, 'three friends');
  const names = await page.locator('.friend').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  assert(names.join(',') === 'Myna,Kapi,Ziggy', 'friend names ' + names.join(','));
  const storyLoaded = await page.locator('.story-ane').evaluate((el) => el.complete && el.naturalWidth > 0);
  assert(storyLoaded, 'sad Ane did not load');
  for (const friend of await page.locator('.friend').all()) {
    const r = await friend.boundingBox();
    assert(r && r.width >= 88 && r.height >= 88, 'friend smaller than 88');
  }
  await shot('pick.png');
  await page.locator('.friend').first().click();
  await pause(250);
  assert(await page.locator('#mango-play').isVisible(), 'play visible');
  assert(await page.locator('#mango-friend').getAttribute('data-pose') === 'idle', 'friend did not start idle');
  const friendLoaded = await page.locator('#mango-friend').evaluate((el) => el.complete && el.naturalWidth > 0);
  assert(friendLoaded, 'friend pose did not load');
  assert((await utters()).some((t) => /^Find number [1-5]!$/.test(t)), 'find prompt');
  const bubbles = page.locator('.bubble');
  assert(await bubbles.count() === 3, 'three bubbles');
  const digits = await bubbles.evaluateAll((els) => els.map((el) => el.getAttribute('data-digit')));
  assert(new Set(digits).size === 3, 'duplicate digits ' + digits.join(','));
  assert(digits.every((d) => ['1', '2', '3', '4', '5'].includes(d)), 'digit out of range');
  const target = await page.locator('#mango-play').getAttribute('data-target');
  assert(digits.includes(target), 'correct digit missing');
  for (const bubble of await bubbles.all()) {
    const r = await bubble.boundingBox();
    assert(r && r.width >= 88 && r.height >= 88, 'bubble smaller than 88');
  }
  await shot('play.png');

  const wrong = digits.find((d) => d !== target);
  const before = await utters();
  await page.locator('.bubble[data-digit="' + wrong + '"]').click({ force: true });
  await pause(200);
  assert((await page.locator('#mango-play').getAttribute('data-found')) === '0', 'wrong tap scored');
  assert((await page.locator('#mango-count').textContent()) === '0/5', 'counter moved on a miss');
  const afterWrong = await utters();
  assert(afterWrong.slice(before.length).some((t) => t === 'Try again!'), 'no try again ' + afterWrong.join(' | '));
  assert(await page.locator('#mango-friend').getAttribute('data-pose') === 'encourage', 'miss did not switch to encourage');
  assert((await page.locator('#mango-cheer').textContent()) === 'Try again!', 'miss line not on screen');
  await shot('wrong.png');

  async function tapRight() {
    const n = await page.locator('#mango-play').getAttribute('data-target');
    const have = await page.locator('#mango-play').getAttribute('data-found');
    await page.locator('#mango-play .bubble[data-digit="' + n + '"]').click({ force: true });
    await page.waitForFunction((prev) => {
      const play = document.getElementById('mango-play');
      const win = document.getElementById('mango-win');
      return (play && play.getAttribute('data-found') !== prev) || (win && !win.hidden);
    }, have, { timeout: 4000 });
  }

  await tapRight();
  assert((await page.locator('#mango-count').textContent()) === '1/5', 'first mango');
  assert((await utters()).some((t) => t.includes('Shabhash!')), 'cheer missing');
  assert(await page.locator('#mango-friend').getAttribute('data-pose') === 'cheer', 'hit did not switch to cheer');
  assert((await page.locator('#mango-cheer').textContent() || '').includes('Shabhash!'), 'cheer not on screen');
  await shot('found.png');
  await page.locator('#mango-replay').click();
  await page.waitForFunction(() => {
    const play = document.getElementById('mango-play');
    return play && play.getAttribute('data-busy') === '0' && !play.hidden;
  });
  const replayTarget = await page.locator('#mango-play').getAttribute('data-target');
  assert((await utters()).filter((t) => t === 'Find number ' + replayTarget + '!').length >= 1, 'replay did not speak');

  for (let i = 0; i < 4; i++) {
    await page.waitForFunction(() => document.getElementById('mango-play').getAttribute('data-busy') === '0');
    await tapRight();
  }
  await page.waitForFunction(() => !document.getElementById('mango-win').hidden);
  assert(await page.locator('#mango-win').isVisible(), 'win screen');
  const spoons = await page.locator('#mango-win').getAttribute('data-spoons');
  const spoonText = await page.locator('#mango-spoons').textContent();
  const expected = spoons === '1' ? 'Now find 1 real spoon!' : 'Now find ' + spoons + ' real spoons!';
  assert(spoonText === expected, 'spoon line ' + spoonText + ' vs ' + expected);
  assert((await utters()).some((t) => t === expected), 'spoon line not spoken');
  const winSrc = await page.locator('.win-ane').getAttribute('src');
  assert(winSrc && winSrc.includes('ane-win'), 'win pose ' + winSrc);
  const winLoaded = await page.locator('.win-ane').evaluate((el) => el.complete && el.naturalWidth > 0);
  assert(winLoaded, 'win Ane did not load');
  assert(await page.locator('#mango-play').isHidden(), 'bubbles still up after the win');
  const again = await box('#mango-again');
  assert(again.height >= 88, 'play again small');
  await shot('win.png');

  await page.locator('#mango-again').click();
  await pause(150);
  assert(await page.locator('#mango-pick').isVisible(), 'play again returns to friends');
  await page.locator('#mango-back').click();
  await pause(150);
  assert(await page.locator('#mango').isHidden(), 'back leaves the game');
  assert(await page.locator('#screen-together').count() === 1, 'tower together still underneath');

  const outside = requests.filter((url) => !url.startsWith(origin));
  assert(outside.length === 0, 'left the page ' + outside.join(', '));
  assert(pageErrors.length === 0, 'page errors ' + pageErrors.join('\n'));
  assert(consoleErrors.length === 0, 'console errors ' + consoleErrors.join('\n'));

  const narrow = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(origin + '/blocks.html', { waitUntil: 'load' });
  for (let i = 0; i < 5; i++) await narrowPage.locator('#next').click();
  await narrowPage.locator('#mango-open').click();
  await narrowPage.locator('#mango-skip').click();
  const narrowFriends = await narrowPage.locator('.friend').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }));
  await narrowPage.locator('.friend').nth(1).click();
  await narrowPage.screenshot({ path: join(shots, 'narrow-320.png') });
  const narrowSize = await narrowPage.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bubbles: [...document.querySelectorAll('.bubble')].map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, right: r.right };
    }),
  }));
  narrowSize.friends = narrowFriends;
  assert(narrowSize.sw <= narrowSize.cw + 1, '320 overflow ' + narrowSize.sw);
  for (const bubble of narrowSize.bubbles) {
    assert(bubble.w >= 88 && bubble.h >= 88, '320 bubble ' + bubble.w + 'x' + bubble.h);
    assert(bubble.left >= -1 && bubble.right <= narrowSize.cw + 1, '320 bubble offscreen');
  }
  for (const friend of narrowSize.friends) {
    assert(friend.w >= 88 && friend.h >= 88, '320 friend ' + friend.w + 'x' + friend.h);
  }
  await narrow.close();

  console.log('bubbles harness passed');
  console.log('spoon line', expected);
} catch (err) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: join(shots, 'failure.png') }).catch(() => {});
  console.error('bubbles harness failed');
  console.error(err);
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  server.close();
  if (video && process.exitCode !== 1) {
    await mkdir(artifacts, { recursive: true });
    await copyFile(await video.path(), join(artifacts, 'bubbles-walkthrough.webm'));
    console.log('video', join(artifacts, 'bubbles-walkthrough.webm'));
  }
}
