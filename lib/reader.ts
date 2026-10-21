import { extractArticle } from './extract';
import { installFonts } from './fonts';
import { ReaderOverlay } from './overlay';
import { loadSettings } from './settings';

declare global {
  interface Window {
    __focusReader?: ReaderOverlay;
  }
}

/** Open the reader view, or close it if it's already open. Shared by both content scripts. */
export async function toggleReaderView(): Promise<void> {
  if (window.__focusReader) {
    window.__focusReader.close();
    return;
  }
  const article = extractArticle(document);
  if (!article) {
    toast('Focus Reader could not find an article on this page.');
    return;
  }
  installFonts();
  const overlay = new ReaderOverlay(article, await loadSettings(), () => (window.__focusReader = undefined));
  window.__focusReader = overlay;
  overlay.open();
}

export function toast(message: string): void {
  const el = document.createElement('focus-reader-ui');
  el.textContent = message;
  el.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;' +
    'border-radius:8px;background:#1f2328;color:#fff;font:14px system-ui,sans-serif;box-shadow:0 4px 16px #0004';
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
