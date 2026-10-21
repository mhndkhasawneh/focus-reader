import { FlowSession } from '@/lib/flow/session';
import { SelectionToolbar, type ToolbarAction } from '@/lib/flow/toolbar';
import { toast, toggleReaderView } from '@/lib/reader';
import { loadSettings, onSettingsChanged, saveSettings, type Settings } from '@/lib/settings';

export type FlowIntent = 'arm' | 'toggle' | 'start';

class FlowController {
  private toolbar = new SelectionToolbar((action, range) => void this.onToolbar(action, range));
  private session: FlowSession | null = null;

  constructor(private s: Settings) {
    onSettingsChanged((next) => {
      this.s = next;
      this.session?.update(next);
    });
  }

  arm(): void {
    this.toolbar.arm();
  }

  async run(intent: FlowIntent): Promise<void> {
    this.arm();
    if (intent === 'arm') return;
    if (intent === 'toggle' && this.session?.active) return this.session.stop();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) return this.begin(sel.getRangeAt(0), false);
    if (intent === 'start') return this.beginAtViewport();
    toast('Select any text to start focusing, or press ↓ to begin at the top of the screen.');
    const once = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && !this.session?.active) {
        e.preventDefault();
        this.beginAtViewport();
      }
    };
    window.addEventListener('keydown', once, { capture: true, once: true });
  }

  private async onToolbar(action: ToolbarAction, range: Range): Promise<void> {
    if (action === 'reader') return toggleReaderView();
    if (action === 'bionic' && !this.s.bionic) this.s = await saveSettings({ bionic: true });
    this.begin(range, action === 'pace');
  }

  private begin(range: Range, pace: boolean): void {
    this.session ??= new FlowSession(this.s, () => (this.session = null), () => void toggleReaderView());
    const ok = this.session.start({ node: range.startContainer, offset: range.startOffset }, pace);
    if (!ok) toast('Focus Reader could not find readable text here.');
  }

  /** No selection: start at the first paragraph on screen. */
  private beginAtViewport(): void {
    const el = Array.from(document.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, blockquote')).find((p) => {
      const r = p.getBoundingClientRect();
      return r.bottom > 60 && r.top < innerHeight && (p.textContent ?? '').trim().length > 40;
    });
    if (!el) return toast('Focus Reader could not find readable text here.');
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    this.begin(range, false);
  }
}

declare global {
  interface Window {
    __focusFlow?: Promise<FlowController>;
    __focusFlowIntent?: FlowIntent;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  // Injected on demand by background.ts, or on every page when the user opts into the selection toolbar.
  registration: 'runtime',
  async main() {
    const intent = window.__focusFlowIntent ?? 'arm';
    window.__focusFlowIntent = undefined;
    window.__focusFlow ??= loadSettings().then((s) => new FlowController(s));
    await (await window.__focusFlow).run(intent);
  },
});
