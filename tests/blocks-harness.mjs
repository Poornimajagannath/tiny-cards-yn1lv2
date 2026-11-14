/**
 * Phone harness for blocks.html.
 *
 * Makes real: Chromium at 390×844, the tap journey, on-screen copy,
 * tap-target geometry, and the browser console.
 * Does not hear audio. It records every utterance the page sends to
 * speechSynthesis. Headless Chrome may have no Kannada voice, so the
 * harness also forces one kn voice and checks that branch once.
 *
 * Run from the repo root, with the playwright package installed
 * where Node can import it, and Chrome on the machine:
 *   npm install playwright
 *   node tests/blocks-harness.mjs
 * Chrome defaults to /usr/bin/google-chrome. Override with CHROME_PATH.
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { mkdir, copyFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
const shots = join(artifacts, 'blocks');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const server = createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path !== '/' && path !== '/blocks.html') {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const body = await readFile(join(root, 'blocks.html'));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  recordVideo: { dir: '/tmp/blocks-video', size: { width: 390, height: 844 } },
});

const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const requests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('request', (req) => requests.push(req.url()));

await page.addInitScript(() => {
  window.__utters = [];
  const synth = window.speechSynthesis;
  if (!synth || synth.__blocksWrapped) return;
  const orig = synth.speak.bind(synth);
  synth.speak = function (utterance) {
    window.__utters.push({ text: utterance.text, lang: utterance.lang });
    try { return orig(utterance); } catch (err) { /* audio is optional */ }
  };
  synth.__blocksWrapped = true;
});

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function utters() {
  return page.evaluate(() => window.__utters.map((u) => ({ text: u.text, lang: u.lang })));
}

async function shot(name) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: join(shots, name) });
  await pause(700);
}

async function boxes(selector) {
  return page.locator(selector).evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }));
}

function assertMin(list, min, label) {
  assert(list.length > 0, label + ' missing');
  for (const box of list) {
    assert(box.w + 0.5 >= min && box.h + 0.5 >= min, label + ' is ' + box.w.toFixed(1) + '×' + box.h.toFixed(1));
  }
}

async function noSideways() {
  const size = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  assert(size.sw <= size.cw + 1, 'horizontal overflow ' + size.sw + ' > ' + size.cw);
}

try {
  await page.goto(origin + '/blocks.html', { waitUntil: 'load' });
  await page.evaluate(() => new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve([]);
    const finish = () => resolve();
    synth.addEventListener('voiceschanged', finish, { once: true });
    if (synth.getVoices().length) finish();
    else setTimeout(finish, 400);
  }));

  const langs = await page.evaluate(() => (window.speechSynthesis.getVoices() || []).map((v) => v.lang));
  const hadKn = langs.some((lang) => /^kn/i.test(lang));

  await noSideways();
  assert((await page.locator('#numeral').textContent()) === '1', 'opens on 1');
  assert((await page.locator('#kannada').textContent()) === 'ಒಂದು', 'kannada 1');
  assert((await page.locator('#world-text').textContent()) === 'Hold up 1 finger.', 'world 1');
  assert(await page.locator('#blocks .cube').count() === 1, 'one block');
  assertMin(await boxes('#blocks .cube'), 48, 'block');
  assertMin(await boxes('#add-one'), 48, 'add one');
  assertMin(await boxes('#next'), 48, 'next');
  await shot('01-number-1.png');

  await page.locator('#blocks .cube').click();
  await page.locator('#blocks .cube').click();
  assert((await page.locator('#blocks .cube').getAttribute('data-count')) === '1', 'double-tap counted twice');
  await pause(250);
  const afterOne = await utters();
  assert(afterOne.some((u) => u.text === 'one' && u.lang === 'en-US'), 'said one, got ' + JSON.stringify(afterOne));
  const said1 = await page.locator('#said').innerText();
  assert(said1.includes('one') && said1.includes('ಒಂದು'), 'said line ' + said1);
  if (!hadKn) {
    assert(!afterOne.some((u) => /^kn/i.test(u.lang)), 'kn spoken without a kn voice');
  }

  await page.evaluate(() => {
    const voice = { lang: 'kn-IN', name: 'Harness Kannada', voiceURI: 'kn-harness', localService: true, default: false };
    window.speechSynthesis.getVoices = () => [voice];
  });
  await page.locator('#add-one').click();
  await pause(250);
  assert((await page.locator('#numeral').textContent()) === '2', 'add one lands on 2');
  assert(await page.locator('#blocks .cube').count() === 2, 'two blocks');
  assert((await page.locator('#said').textContent()) === '1 and 1 make 2', 'add-one sentence');
  const addUtter = (await utters()).filter((u) => u.text === '1 and 1 make 2');
  assert(addUtter.length === 1 && addUtter[0].lang === 'en-US', 'add-one speech');
  assert((await page.locator('#world-text').textContent()) === 'Find 2 shoes.', 'world 2');
  await shot('02-number-2.png');

  await page.locator('#blocks .cube').first().click();
  await pause(200);
  const knUtters = (await utters()).filter((u) => u.text === 'ಒಂದು');
  assert(knUtters.length >= 1 && /^kn/i.test(knUtters[knUtters.length - 1].lang), 'kannada spoken when a kn voice exists ' + JSON.stringify(await utters()));

  await page.locator('#back').click();
  await pause(150);
  assert((await page.locator('#numeral').textContent()) === '1', 'back to 1');
  await page.locator('#next').click();
  await pause(150);
  assert((await page.locator('#numeral').textContent()) === '2', 'next to 2');
  await page.locator('#next').click();
  await pause(200);
  assert((await page.locator('#numeral').textContent()) === '3', 'screen 3');
  assert((await page.locator('#world-text').textContent()) === 'Build 3 with your blocks.', 'world 3');
  assert(await page.locator('#blocks .cube').count() === 3, 'three blocks');
  const cubes = page.locator('#blocks .cube');
  await cubes.nth(0).click();
  await pause(120);
  await cubes.nth(1).click();
  await pause(120);
  await cubes.nth(2).click();
  await pause(150);
  const counts = await page.locator('#blocks .cube').evaluateAll((els) => els.map((el) => el.getAttribute('data-count')));
  assert(counts.join(',') === '1,2,3', 'counted ' + counts.join(','));
  const said3 = await page.locator('#said').innerText();
  assert(said3.includes('three') && said3.includes('ಮೂರು'), 'counted three ' + said3);
  await shot('03-number-3.png');

  await page.locator('#next').click();
  await pause(200);
  assert((await page.locator('#numeral').textContent()) === '4', 'screen 4');
  assert((await page.locator('#world-text').textContent()) === 'Find 4 spoons.', 'world 4');
  await noSideways();
  assertMin(await boxes('#blocks .cube'), 48, 'block on 4');
  await shot('04-number-4.png');

  await page.locator('#next').click();
  await pause(200);
  assert((await page.locator('#numeral').textContent()) === '5', 'screen 5');
  assert((await page.locator('#kannada').textContent()) === 'ಐದು', 'kannada 5');
  assert((await page.locator('#world-text').textContent()) === 'Clap 5 times.', 'world 5');
  assert(await page.locator('#blocks .cube').count() === 5, 'five blocks');
  await noSideways();
  assertMin(await boxes('#blocks .cube'), 48, 'block on 5');
  const rects = await page.locator('#blocks .cube').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  }));
  assert(Math.max(...rects.map((r) => r.left)) - Math.min(...rects.map((r) => r.left)) < 4, 'five blocks are not one tower');
  assert(Math.max(...rects.map((r) => r.top)) - Math.min(...rects.map((r) => r.top)) > 40, 'tower has no height');
  assert(rects.every((r) => r.w >= 64 && r.h >= 64), 'five blocks too small ' + JSON.stringify(rects));
  await shot('05-number-5.png');
  const five = page.locator('#blocks .cube');
  for (let i = 0; i < 5; i++) await five.nth(i).click();
  const rapid = await five.evaluateAll((els) => els.map((el) => el.getAttribute('data-count')));
  assert(rapid.join(',') === '1,2,3,4,5', 'rapid taps ' + rapid.join(','));

  await page.locator('#add-one').click();
  await pause(250);
  assert((await page.locator('#numeral').textContent()) === '6', 'five and one make six');
  assert(await page.locator('#blocks .cube').count() === 6, 'six blocks');
  assert((await page.locator('#said').textContent()) === '5 and 1 make 6', 'six sentence');
  await page.locator('#add-one').click();
  await pause(150);
  assert((await page.locator('#numeral').textContent()) === '5', 'back to five');
  assert(await page.locator('#blocks .cube').count() === 5, 'five again');

  await page.locator('#next').click();
  await pause(250);
  assert(await page.locator('#screen-together').count() === 1, 'together screen');
  assert((await page.locator('#fact-4').getAttribute('data-joined')) === 'false', '4 starts split');
  assert((await page.locator('#fact-5').getAttribute('data-joined')) === 'false', '5 starts split');
  assert(await page.locator('#fact-4 .pile').count() === 2, 'two piles of 2');
  assert(await page.locator('#fact-5 .pile').count() === 2, 'piles of 3 and 2');
  const pileCounts = await page.locator('#fact-5 .pile').evaluateAll((els) => els.map((el) => el.querySelectorAll('.cube').length));
  assert(pileCounts.join(',') === '3,2', '3 and 2, got ' + pileCounts.join(','));
  assertMin(await boxes('#fact-4 .pile'), 48, 'pile');
  assertMin(await boxes('#back'), 48, 'back');
  await noSideways();
  await shot('06-together-split.png');

  await page.locator('#fact-4 .pile').first().click();
  await pause(250);
  assert((await page.locator('#fact-4').getAttribute('data-joined')) === 'true', '4 joined');
  assert(await page.locator('#fact-4 .pile').count() === 1, 'one pile of 4');
  assert(await page.locator('#fact-4 .cube').count() === 4, 'four cubes joined');
  assert((await page.locator('#fact-4 .fact-line').textContent()) === '2 and 2 make 4', 'join line');
  const joinUtter = (await utters()).filter((u) => u.text === '2 and 2 make 4');
  assert(joinUtter.length === 1, 'join speech');
  await shot('07-together-joined.png');

  await page.locator('#fact-4 .pile').click();
  await pause(250);
  assert((await page.locator('#fact-4').getAttribute('data-joined')) === 'false', '4 split again');
  assert(await page.locator('#fact-4 .pile').count() === 2, 'split into two');
  assert((await utters()).some((u) => u.text === '4 is 2 and 2'), 'split speech');

  await page.locator('#fact-5 .pile').first().click();
  await pause(250);
  assert((await page.locator('#fact-5').getAttribute('data-joined')) === 'true', '5 joined');
  assert(await page.locator('#fact-5 .cube').count() === 5, 'five cubes joined');
  assert((await page.locator('#fact-5 .fact-line').textContent()) === '3 and 2 make 5', '5 join line');
  assert((await utters()).some((u) => u.text === '3 and 2 make 5'), '5 join speech');

  await page.locator('#fact-5 .pile').click();
  await pause(200);
  assert((await page.locator('#fact-5').getAttribute('data-joined')) === 'false', '5 split');
  assert((await utters()).some((u) => u.text === '5 is 3 and 2'), '5 split speech');

  await page.locator('#back').click();
  await pause(150);
  assert((await page.locator('#numeral').textContent()) === '5', 'back from together');

  const knBox = await page.locator('#kannada').evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }));
  assert(knBox.scroll <= knBox.client + 2, 'kannada clipped ' + JSON.stringify(knBox));

  await page.goto(origin + '/blocks.html', { waitUntil: 'load' });
  await page.locator('#add-one').click();
  await page.locator('#blocks .cube').first().click();
  assert((await page.locator('#numeral').textContent()) === '2', 'tap during add-one');
  assert((await page.locator('#blocks .cube[data-count]').count()) === 1, 'tap during animation counted');

  async function fit(width, height, name) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (err) => errs.push(String(err)));
    await p.goto(origin + '/blocks.html', { waitUntil: 'load' });
    await p.locator('#next').click();
    await p.locator('#next').click();
    await p.locator('#next').click();
    await p.locator('#next').click();
    const size = await p.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
    }));
    assert(size.sw <= size.cw + 1, name + ' sideways ' + size.sw);
    const blocks = await p.locator('#blocks .cube').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, top: r.top, bottom: r.bottom };
    }));
    assert(blocks.length === 5, name + ' lost blocks');
    assert(blocks.every((b) => b.w >= 48 && b.h >= 48 && b.top >= -1 && b.bottom <= height + 1), name + ' blocks ' + JSON.stringify(blocks));
    await p.screenshot({ path: join(shots, name + '.png') });
    assert(errs.length === 0, name + ' errors ' + errs.join('\n'));
    await ctx.close();
  }
  await fit(320, 700, 'break-320');
  await fit(430, 932, 'break-430');
  await fit(700, 360, 'break-landscape');

  const mute = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mute.addInitScript(() => {
    try {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get() { return undefined; } });
    } catch (err) { /* the page still has to survive a missing voice */ }
  });
  const mutePage = await mute.newPage();
  const muteErrors = [];
  mutePage.on('pageerror', (err) => muteErrors.push(String(err)));
  await mutePage.goto(origin + '/blocks.html', { waitUntil: 'load' });
  await mutePage.locator('#blocks .cube').click();
  assert((await mutePage.locator('#said').innerText()).includes('one'), 'count still shows with no speech');
  assert(muteErrors.length === 0, 'no-speech errors ' + muteErrors.join('\n'));
  await mute.close();

  const outside = requests.filter((url) => !url.startsWith(origin));
  assert(outside.length === 0, 'left the origin: ' + outside.join(', '));
  assert(pageErrors.length === 0, 'page errors: ' + pageErrors.join('\n'));
  assert(consoleErrors.length === 0, 'console errors: ' + consoleErrors.join('\n'));

  const narrow = await browser.newContext({
    viewport: { width: 320, height: 700 },
    deviceScaleFactor: 2,
  });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(origin + '/blocks.html', { waitUntil: 'load' });
  const narrowSize = await narrowPage.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  assert(narrowSize.sw <= narrowSize.cw + 1, '320 overflow ' + narrowSize.sw);
  const narrowBlock = await narrowPage.locator('#blocks .cube').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  assert(narrowBlock.w >= 48 && narrowBlock.h >= 48, '320 block ' + narrowBlock.w);
  await narrow.close();

  console.log('blocks harness passed');
  console.log('voices at start:', langs.join(', ') || '(none)');
  console.log('kannada voice on this browser:', hadKn ? 'yes' : 'no, branch forced');
} catch (err) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: join(shots, 'failure.png') }).catch(() => {});
  console.error('blocks harness failed');
  console.error(err);
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  server.close();
  if (video && process.exitCode !== 1) {
    await mkdir(artifacts, { recursive: true });
    const saved = await video.path();
    await copyFile(saved, join(artifacts, 'blocks-walkthrough.webm'));
    console.log('video', join(artifacts, 'blocks-walkthrough.webm'));
  }
}
