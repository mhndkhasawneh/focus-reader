// Records docs/demo.gif: the reading finger following the mouse through an article with the real extension loaded.
// Run with `npm run demo` (builds the test variant first). Needs ffmpeg on PATH.
//
// Headless Chromium never paints the mouse pointer into a recording, so the page draws it: an overlay reads the
// cursor the extension actually set on the element under the mouse (getComputedStyle(...).cursor) and shows that
// image at the pointer, honouring its hotspot. Everything else is the extension running unmodified.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const extensionPath = join(root, 'dist-e2e/chrome-mv3');
const fixture = readFileSync(join(root, 'tests/e2e/article.html'));
const out = join(root, 'docs/demo.gif');
const videoDir = mkdtempSync(join(tmpdir(), 'focus-reader-demo-'));

const server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(fixture));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/article`;

const W = 960, H = 600;
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: W, height: H },
  recordVideo: { dir: videoDir, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const setSettings = (patch) => worker.evaluate((p) => chrome.storage.sync.set({ settings: p }), patch);
await worker.evaluate(() => chrome.storage.sync.clear());

const page = context.pages()[0] ?? (await context.newPage());
await page.addInitScript(() => {
  // Draw the real cursor at the pointer, and a caption pill, without touching the article.
  addEventListener('DOMContentLoaded', () => {
    const cur = document.createElement('img');
    cur.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:-99px;top:-99px;width:32px;height:32px';
    const cap = document.createElement('div');
    cap.style.cssText =
      'position:fixed;z-index:2147483646;right:24px;top:20px;padding:8px 14px;border-radius:999px;background:#1f2328;' +
      'color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 4px 14px #0003;pointer-events:none';
    document.documentElement.append(cur, cap);
    window.__caption = (t) => (cap.textContent = t);
    const ARROW =
      "data:image/svg+xml," +
      encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><path d='M5 3v21l5.5-5.2 3.7 8 3.3-1.5-3.6-7.8H21z' fill='#111' stroke='#fff' stroke-width='1.5' stroke-linejoin='round'/></svg>");
    addEventListener('mousemove', (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const css = el ? getComputedStyle(el).cursor : 'auto';
      const m = css.match(/url\("(.+?)"\)\s+(\d+)\s+(\d+)/);
      const [src, hx, hy] = m ? [m[1], +m[2], +m[3]] : [ARROW, 5, 3];
      if (cur.src !== src) cur.src = src;
      cur.style.left = `${e.clientX - hx}px`;
      cur.style.top = `${e.clientY - hy}px`;
    }, true);
  });
});
await page.goto(url);
// Demo-only page styling so the GIF looks like a real article (the extension doesn't care).
await page.addStyleTag({
  content: `body{font:19px/1.65 Georgia,serif;color:#24292f;background:#fff} .ad,.site-nav,aside,.comments{display:none}
    main{max-width:720px;margin:28px auto;padding:0 24px} h1{font:700 34px/1.2 system-ui,sans-serif;margin:0 0 6px}
    .byline{color:#6a737d;font:15px system-ui,sans-serif} p{margin:0 0 18px}`,
});
const caption = (t) => page.evaluate((x) => window.__caption(x), t);
const paragraphs = page.locator('article p:not(.byline)');

/** Glide along a paragraph's lines like a finger under the text. */
async function readAlong(i, lines = 2) {
  const box = await paragraphs.nth(i).boundingBox();
  const lineH = 31;
  for (let l = 0; l < lines; l++) {
    const y = box.y + lineH * l + 20;
    await page.mouse.move(box.x + 12, y, { steps: 8 });
    await page.mouse.move(box.x + box.width - 40, y, { steps: 40 });
  }
}

await page.mouse.move(W - 120, 120);
await caption('Reading finger · Hand');
await page.waitForTimeout(500);
await readAlong(0, 2);
await readAlong(1, 2);

await setSettings({ hoverCursor: 'sleeve', hoverColor: '#6cb6ff' });
await caption('Sleeve · blue');
await readAlong(2, 2);

await setSettings({ hoverCursor: 'finger', hoverColor: '#5fd38d' });
await caption('Finger · green');
await readAlong(3, 2);

await setSettings({ hoverCursor: 'hand', hoverColor: '#ff8fc7' });
await caption('Hand · pink');
await readAlong(4, 2);
await page.waitForTimeout(700);

await page.close();
await context.close();
server.close();

const [video] = readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
const filters = 'fps=12,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
// Trim the blank first second (browser start-up and page load).
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', join(videoDir, video), '-vf', filters, '-loop', '0', out]);
rmSync(videoDir, { recursive: true, force: true });
console.log(`wrote ${out}`);
