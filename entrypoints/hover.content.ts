import { focusReaderBusy, HoverHighlighter } from '@/lib/hover';
import { SHOW_TOOLBAR, type Message } from '@/lib/messages';
import { loadSettings, onSettingsChanged } from '@/lib/settings';

export default defineContentScript({
  // The always-on script: hover highlight, and double-click to bring up the focus toolbar. It stays small;
  // the full in-page focus code is injected only when you ask for it.
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  async main() {
    const hover = new HoverHighlighter(await loadSettings());
    onSettingsChanged((s) => hover.update(s));

    document.addEventListener('dblclick', (e) => {
      // window.__focusFlow is set by flow.content.ts once the toolbar is armed here; its own listener takes over.
      if (window.__focusFlow || focusReaderBusy()) return;
      const target = e.target as Element;
      if (target.closest?.('input, textarea, select, [contenteditable], focus-reader-ui, focus-reader-root')) return;
      if ((window.getSelection()?.toString().trim().length ?? 0) < 2) return;
      void browser.runtime.sendMessage({ type: SHOW_TOOLBAR } satisfies Message);
    });
  },
});
