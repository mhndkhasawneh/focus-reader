// The selection toolbar: select text anywhere on the page and a small bar offers to start focusing there.

export type ToolbarAction = 'focus' | 'pace' | 'bionic' | 'reader';

export class SelectionToolbar {
  private host = document.createElement('focus-reader-ui');
  private root = this.host.attachShadow({ mode: 'open' });
  private range: Range | null = null;
  private armed = false;

  constructor(private onAction: (action: ToolbarAction, range: Range) => void) {
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="tb" role="toolbar" aria-label="Focus Reader">
        <button data-act="focus" title="Focus on the text from here">◎ Focus</button>
        <button data-act="pace" title="Auto-pace from here">▶ Pace</button>
        <button data-act="bionic" title="Focus with bionic text"><b>Bi</b>onic</button>
        <button data-act="reader" title="Open the reader view">Reader</button>
      </div>`;
    // mousedown, not click: a click would collapse the page selection before we read it.
    this.root.querySelector('.tb')!.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const act = (e.target as HTMLElement).closest('button')?.dataset.act as ToolbarAction | undefined;
      if (act && this.range) {
        const range = this.range;
        this.hide();
        this.onAction(act, range);
      }
    });
  }

  arm(): void {
    if (this.armed) return;
    this.armed = true;
    document.addEventListener('mouseup', this.check, true);
    document.addEventListener('keyup', this.onKeyUp, true);
    document.addEventListener('selectionchange', this.onSelectionChange);
  }

  disarm(): void {
    this.armed = false;
    document.removeEventListener('mouseup', this.check, true);
    document.removeEventListener('keyup', this.onKeyUp, true);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    this.hide();
  }

  hide(): void {
    this.host.remove();
    this.range = null;
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.hide();
    else if (e.shiftKey) this.check(); // keyboard selections (Shift + arrows)
  };

  private onSelectionChange = (): void => {
    if (this.range && window.getSelection()?.isCollapsed) this.hide();
  };

  private check = (e?: Event): void => {
    if (e && (e.target as Element).closest?.('focus-reader-ui, focus-reader-root')) return;
    // Let the browser finish updating the selection first.
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return this.hide();
      const range = sel.getRangeAt(0);
      const anchor = range.commonAncestorContainer;
      const el = anchor instanceof Element ? anchor : anchor.parentElement;
      if (!el || el.closest('input, textarea, [contenteditable], focus-reader-ui, focus-reader-root')) return this.hide();
      if (sel.toString().trim().length < 2) return this.hide();
      this.show(range.cloneRange());
    }, 0);
  };

  private show(range: Range): void {
    this.range = range;
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    const tb = this.root.querySelector<HTMLElement>('.tb')!;
    const rects = range.getClientRects();
    const r = rects[0] ?? range.getBoundingClientRect();
    const w = tb.offsetWidth || 300;
    const h = tb.offsetHeight || 40;
    // Above the first line of the selection; below it when there's no room at the top of the viewport.
    const above = r.top - h - 8 >= 8;
    const top = (above ? r.top - h - 8 : (rects[rects.length - 1] ?? r).bottom + 8) + scrollY;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, document.documentElement.clientWidth - w - 8)) + scrollX;
    tb.style.top = `${top}px`;
    tb.style.left = `${left}px`;
  }
}

const CSS = `
:host { all: initial; }
.tb {
  position: absolute; z-index: 2147483647; display: flex; gap: 2px; padding: 4px; border-radius: 10px;
  background: #1f2328; color: #f4f4f4; font: 13px/1 system-ui, sans-serif; white-space: nowrap;
  box-shadow: 0 6px 22px rgba(0,0,0,.25); animation: in .12s ease-out;
}
@keyframes in { from { opacity: 0; transform: translateY(4px); } }
@media (prefers-reduced-motion: reduce) { .tb { animation: none; } }
button { font: inherit; color: inherit; background: transparent; border: 0; border-radius: 7px; padding: 8px 10px; cursor: pointer; }
button:hover { background: rgba(255,255,255,.14); }
`;
