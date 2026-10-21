/// <reference types="chrome" />
import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

// Run `FOCUS_READER_E2E=1 npx wxt build` first (npm run test:e2e does both).
const extensionPath = resolve(import.meta.dirname, '../../dist-e2e/chrome-mv3');
const fixture = readFileSync(resolve(import.meta.dirname, 'article.html'));

let server: Server;
let url: string;
let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(fixture));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/article`;
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

/** What a toolbar click does: inject the reader into the active tab (injecting again toggles it). */
async function toggleReader(page: Page) {
  await page.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ['/content-scripts/reader.js'] });
  });
}

/** What the icon / Alt+Shift+F / context menu do in flow mode. */
async function runFlow(page: Page, intent: 'arm' | 'toggle' | 'start') {
  await page.bringToFront();
  await worker.evaluate(async (i) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const target = { tabId: tab!.id! };
    await chrome.scripting.executeScript({ target, func: (x: string) => void ((window as any).__focusFlowIntent = x), args: [i] });
    await chrome.scripting.executeScript({ target, files: ['/content-scripts/flow.js'] });
  }, intent);
}

const highlightText = (page: Page, name: string) =>
  page.evaluate((n) => {
    const h = CSS.highlights.get(n);
    return h ? Array.from(h as unknown as Iterable<Range>, (r) => r.toString()).join('|') : null;
  }, name);

test('flow mode: select text, focus in place, step, pace, bionic, and restore the page exactly', async () => {
  const page = await context.newPage();
  await page.goto(url);
  await worker.evaluate(() => chrome.storage.sync.clear());
  const original = await page.locator('article').innerHTML();
  await runFlow(page, 'arm');

  // Selecting a word in the second paragraph shows the toolbar above it.
  const p2 = page.locator('article p').nth(2);
  await p2.dblclick({ position: { x: 30, y: 8 } });
  const toolbar = page.locator('focus-reader-ui .tb');
  await expect(toolbar).toBeVisible();
  const tbBox = (await toolbar.boundingBox())!;
  const pBox = (await p2.boundingBox())!;
  expect(tbBox.y + tbBox.height).toBeLessThanOrEqual(pBox.y + 4);

  await toolbar.getByRole('button', { name: /Focus/ }).click();
  await expect(toolbar).toBeHidden();
  const veil = page.locator('focus-reader-ui.fr-veil');
  await expect(veil).toBeAttached();
  await expect.poll(() => highlightText(page, 'fr-sentence')).toBe('Reading tools try to give some of that attention back.');
  const vBox = (await veil.boundingBox())!;
  const p2Box = (await p2.boundingBox())!;
  expect(Math.abs(vBox.y + 10 - p2Box.y)).toBeLessThan(3);
  expect(Math.abs(vBox.height - 20 - p2Box.height)).toBeLessThan(3);
  await page.screenshot({ path: 'test-results/flow-sentence.png' });

  // Stepping: next sentence, then into the next paragraph.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => highlightText(page, 'fr-sentence')).toMatch(/^The simplest ones strip/);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => highlightText(page, 'fr-sentence')).toBe('Others go further.');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => highlightText(page, 'fr-sentence')).toMatch(/^The simplest ones strip/);

  // Bionic edits the text in place without changing it.
  await page.keyboard.press('b');
  await expect(page.locator('article fr-b').first()).toBeAttached();
  await expect.poll(() => highlightText(page, 'fr-sentence')).toMatch(/^The simplest ones strip/);
  expect(await page.locator('article').innerText()).toContain('The simplest ones strip the page down');

  // Pacing runs a word highlight forward through the text.
  await page.keyboard.press('Space');
  await expect.poll(() => highlightText(page, 'fr-word')).toBeTruthy();
  const w1 = await highlightText(page, 'fr-word');
  await page.waitForTimeout(800);
  expect(await highlightText(page, 'fr-word')).not.toBe(w1);
  await page.screenshot({ path: 'test-results/flow-pacing.png' });
  await page.keyboard.press('Space');

  // Sentence/paragraph switch.
  await page.keyboard.press('s');
  await expect.poll(() => highlightText(page, 'fr-sentence')).toBeNull();
  await page.keyboard.press('s');

  // Exit: veil, highlights and bionic wrappers are gone and the article markup is byte-identical.
  await page.keyboard.press('Escape');
  await expect(veil).toHaveCount(0);
  expect(await page.evaluate(() => CSS.highlights.size)).toBe(0);
  expect(await page.locator('article').innerHTML()).toBe(original);
  await page.close();
});

test('flow mode: context-menu start with no selection begins at the first paragraph on screen', async () => {
  const page = await context.newPage();
  await page.goto(url);
  await worker.evaluate(() => chrome.storage.sync.clear());
  await runFlow(page, 'start');
  await expect.poll(() => highlightText(page, 'fr-sentence')).toMatch(/^Attention is a limited resource/);
  // Clicking further down the text moves the focus there.
  await page.locator('article p').nth(4).click({ position: { x: 40, y: 8 } });
  await expect.poll(() => highlightText(page, 'fr-sentence')).toMatch(/^A spotlight dims everything/);
  // The bar's Reader button hands over to the reader view.
  await page.locator('focus-reader-ui').getByRole('button', { name: 'Reader' }).click();
  await expect(page.locator('focus-reader-root .fr')).toBeVisible();
  await expect(page.locator('focus-reader-ui.fr-veil')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.close();
});

test('opens a clean reader, applies focus aids, paces, and closes', async () => {
  const page = await context.newPage();
  await page.goto(url);
  await toggleReader(page);

  const reader = page.locator('focus-reader-root .fr');
  await expect(reader).toBeVisible();
  await expect(reader.locator('.title')).toHaveText('Reading with less noise');
  await expect(reader.locator('.meta')).toContainText('min read');
  const article = reader.locator('.content');
  await expect(article).toContainText('Attention is a limited resource');
  await expect(article).not.toContainText('ADVERTISEMENT');
  await expect(article).not.toContainText('Trending');
  await expect(article).not.toContainText('First!');
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  await page.screenshot({ path: 'test-results/reader.png' });

  // Bionic: first ceil(len * 0.4) letters bolded.
  await page.keyboard.press('b');
  await expect(article.locator('.w b').first()).toBeVisible();
  const attention = article.locator('.w', { hasText: /^Attention$/ }).first();
  await expect(attention.locator('b')).toHaveText('Atte');

  // Spotlight: one active paragraph, moved with the arrow keys.
  await page.keyboard.press('f');
  await expect(reader).toHaveClass(/spotlight/);
  await page.keyboard.press('ArrowDown');
  await expect(article.locator('.active')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/reader-bionic-spotlight.png' });

  // Auto-pace: the highlighted word moves forward on its own.
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  const first = await article.locator('.w.now').textContent();
  await page.waitForTimeout(900);
  const later = await article.locator('.w.now').textContent();
  expect(first).toBeTruthy();
  expect(later).not.toBe(first);
  expect(await article.locator('.w.read').count()).toBeGreaterThan(3);
  await page.keyboard.press('Space');
  await page.screenshot({ path: 'test-results/reader-pacing.png' });

  // Settings persist: reopening keeps bionic + spotlight on.
  await page.keyboard.press('Escape');
  await expect(page.locator('focus-reader-root')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await toggleReader(page);
  await expect(reader).toHaveClass(/spotlight/);
  await expect(article.locator('.w b').first()).toBeVisible();

  // Injecting again closes it, like a second toolbar click.
  await toggleReader(page);
  await expect(page.locator('focus-reader-root')).toHaveCount(0);
});

test('explains itself on pages without an article', async () => {
  const page = await context.newPage();
  await page.goto(url);
  await page.setContent('<html><body><button>Just a button</button></body></html>');
  await toggleReader(page);
  await expect(page.getByText('could not find an article')).toBeVisible();
  await expect(page.locator('focus-reader-root')).toHaveCount(0);
});
