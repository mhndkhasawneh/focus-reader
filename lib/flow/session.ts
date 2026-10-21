// Flow mode: focus on the live page. A veil dims everything except the current block, and the CSS Custom
// Highlight API paints the current sentence/word without touching the page's markup. Only bionic text
// changes the DOM, and it is fully reverted on exit.
import { boldLength, splitWords } from '../bionic';
import { step, wordsPerMinute, type PacerState } from '../pacer';
import { saveSettings, type Settings } from '../settings';
import { collectBlocks, findContainer, indexAt, offsetOf, rangeOf, buildBlock, type Block } from './model';

const H_SENTENCE = 'fr-sentence';
const H_WORD = 'fr-word';
const H_READ = 'fr-read';

export interface StartPoint {
  node: Node;
  offset: number;
}

export class FlowSession {
  private blocks: Block[] = [];
  private bi = 0; // current block
  private si = 0; // current sentence in block
  private veil = document.createElement('focus-reader-ui');
  private bar = document.createElement('focus-reader-ui');
  private barRoot = this.bar.attachShadow({ mode: 'open' });
  private bionicWrappers: HTMLElement[] = [];
  private pacer: PacerState = { charIndex: 0, holdMs: 0 };
  private playing = false;
  private raf = 0;
  private lastFrame = 0;
  private repositionQueued = false;

  constructor(private s: Settings, private onExit: () => void, private openReader: () => void) {}

  get active(): boolean {
    return this.veil.isConnected;
  }

  /** Start (or move) the session to the block/sentence containing `at`. */
  start(at: StartPoint, pace = false): boolean {
    const startEl = at.node instanceof Element ? at.node : at.node.parentElement;
    if (!startEl) return false;
    if (!this.active) {
      this.blocks = collectBlocks(findContainer(startEl));
      if (this.blocks.length === 0) return false;
      this.mount();
    }
    let bi = this.blocks.findIndex((b) => b.el.contains(at.node));
    if (bi < 0) bi = Math.max(0, this.blocks.findIndex((b) => startEl.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING));
    const block = this.blocks[bi]!;
    const offset = Math.max(0, offsetOf(block, at.node, at.offset));
    this.bi = bi;
    this.si = Math.max(0, indexAt(block.sentences, offset));
    this.pacer = { charIndex: pace ? this.wordStartAt(block, offset) : block.sentences[this.si]?.start ?? 0, holdMs: 0 };
    window.getSelection()?.removeAllRanges();
    this.paint(true);
    if (pace) this.play();
    return true;
  }

  stop(): void {
    if (!this.active) return;
    this.pause();
    this.setBionic(false, false);
    CSS.highlights.delete(H_SENTENCE);
    CSS.highlights.delete(H_WORD);
    CSS.highlights.delete(H_READ);
    this.veil.remove();
    this.bar.remove();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('scroll', this.queueReposition, true);
    window.removeEventListener('resize', this.queueReposition);
    document.removeEventListener('click', this.onClick, true);
    this.onExit();
  }

  update(next: Settings): void {
    const bionicChanged = next.bionic !== this.s.bionic || next.bionicRatio !== this.s.bionicRatio;
    this.s = next;
    if (bionicChanged && this.active) this.setBionic(next.bionic, true);
    this.paint(false);
  }

  // Setup

  private mount(): void {
    injectPageStyles();
    this.veil.className = 'fr-veil';
    this.veil.style.setProperty('--fr-veil', veilColor(this.s.spotlightDim));
    document.documentElement.append(this.veil, this.bar);
    this.renderBar();
    if (this.s.bionic) this.setBionic(true, false);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('scroll', this.queueReposition, { capture: true, passive: true });
    window.addEventListener('resize', this.queueReposition);
    document.addEventListener('click', this.onClick, true);
  }

  private renderBar(): void {
    this.barRoot.innerHTML = `<style>${BAR_CSS}</style>
      <div class="bar" role="toolbar" aria-label="Focus Reader">
        <button data-act="prev" title="Previous (↑)">‹</button>
        <span class="pos"></span>
        <button data-act="next" title="Next (↓)">›</button>
        <span class="sep"></span>
        <button data-act="slower" title="Slower ([)">−</button>
        <button data-act="pace" class="pace" title="Auto-pace (Space)">▶</button>
        <button data-act="faster" title="Faster (])">+</button>
        <span class="wpm"></span>
        <span class="sep"></span>
        <button data-act="unit" title="Sentence or paragraph (S)"></button>
        <button data-act="bionic" title="Bionic text (B)"><b>Bi</b>onic</button>
        <button data-act="reader" title="Open in reader view">Reader</button>
        <button data-act="exit" title="Exit (Esc)">✕</button>
      </div>`;
    this.barRoot.querySelector('.bar')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act) this.act(act);
    });
  }

  private paintBar(): void {
    const block = this.blocks[this.bi];
    const sentence = this.s.flowUnit === 'sentence';
    this.barRoot.querySelector('.pos')!.textContent = sentence
      ? `${this.si + 1}/${block?.sentences.length ?? 0} · ¶${this.bi + 1}`
      : `¶ ${this.bi + 1}/${this.blocks.length}`;
    this.barRoot.querySelector('[data-act="unit"]')!.textContent = sentence ? 'Sentence' : 'Paragraph';
    this.barRoot.querySelector('[data-act="bionic"]')!.classList.toggle('on', this.s.bionic);
    this.barRoot.querySelector('.pace')!.textContent = this.playing ? '❚❚' : '▶';
    this.barRoot.querySelector('.wpm')!.textContent = `~${wordsPerMinute(this.s.pace)} wpm`;
  }

  // Input

  private act(act: string): void {
    switch (act) {
      case 'next': return this.move(1);
      case 'prev': return this.move(-1);
      case 'pace': return this.playing ? this.pause() : this.play();
      case 'slower': return this.set({ pace: Math.max(1, this.s.pace - 5) });
      case 'faster': return this.set({ pace: Math.min(100, this.s.pace + 5) });
      case 'unit': return this.set({ flowUnit: this.s.flowUnit === 'sentence' ? 'paragraph' : 'sentence' });
      case 'bionic': return this.set({ bionic: !this.s.bionic });
      case 'reader': this.stop(); return this.openReader();
      case 'exit': return this.stop();
    }
  }

  private set(patch: Partial<Settings>): void {
    this.update({ ...this.s, ...patch });
    void saveSettings(patch);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const map: Record<string, string> = {
      ArrowDown: 'next', j: 'next', ArrowUp: 'prev', k: 'prev', ' ': 'pace', '[': 'slower', ']': 'faster',
      s: 'unit', b: 'bionic', Escape: 'exit',
    };
    const act = map[e.key];
    if (!act) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.act(act);
  };

  /** Clicking inside the text (not on a link or a selection) moves the focus there. */
  private onClick = (e: MouseEvent): void => {
    if ((e.target as Element).closest?.('focus-reader-ui, focus-reader-root, a, button, input, textarea, select, label')) return;
    if (!window.getSelection()?.isCollapsed) return;
    const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
    if (pos && this.blocks.some((b) => b.el.contains(pos.offsetNode))) {
      this.start({ node: pos.offsetNode, offset: pos.offset }, this.playing);
    }
  };

  // Navigation

  private move(delta: number): void {
    const wasPlaying = this.playing;
    this.pause();
    const block = this.blocks[this.bi]!;
    if (this.s.flowUnit === 'sentence') {
      const si = this.si + delta;
      if (si >= 0 && si < block.sentences.length) this.si = si;
      else if (this.bi + delta >= 0 && this.bi + delta < this.blocks.length) {
        this.bi += delta;
        this.si = delta > 0 ? 0 : Math.max(0, this.blocks[this.bi]!.sentences.length - 1);
      }
    } else {
      this.bi = Math.max(0, Math.min(this.blocks.length - 1, this.bi + delta));
      this.si = 0;
    }
    const cur = this.blocks[this.bi]!;
    this.pacer = { charIndex: this.s.flowUnit === 'sentence' ? cur.sentences[this.si]?.start ?? 0 : 0, holdMs: 0 };
    this.paint(true);
    if (wasPlaying) this.play();
  }

  // Pacing: the cursor runs through the current block, then continues into the next one.

  private play(): void {
    if (this.playing) return;
    this.playing = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.paintBar();
  }

  private pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    CSS.highlights.delete(H_WORD);
    if (this.active) this.paintBar();
  }

  private tick = (now: number): void => {
    const block = this.blocks[this.bi]!;
    this.pacer = step(this.pacer, now - this.lastFrame, block.text, this.s.pace, this.s.pauseAtPunctuation);
    this.lastFrame = now;
    if (this.pacer.charIndex >= block.text.length) {
      if (this.bi + 1 >= this.blocks.length) {
        this.pause();
        return;
      }
      this.bi++;
      this.pacer = { charIndex: 0, holdMs: 0 };
    }
    const cur = this.blocks[this.bi]!;
    const si = indexAt(cur.sentences, Math.floor(this.pacer.charIndex));
    const moved = si !== this.si;
    this.si = Math.max(0, si);
    this.paint(moved);
    this.raf = requestAnimationFrame(this.tick);
  };

  private wordStartAt(block: Block, offset: number): number {
    const w = block.words.find((x) => offset < x.end);
    return w ? Math.min(offset, w.start) : offset;
  }

  // Painting

  private paint(scroll: boolean): void {
    const block = this.blocks[this.bi];
    if (!block || !this.active) return;
    const sentence = block.sentences[this.si];

    if (this.s.flowUnit === 'sentence' && sentence) setHighlight(H_SENTENCE, rangeOf(block, sentence));
    else CSS.highlights.delete(H_SENTENCE);

    if (this.playing) {
      const at = Math.floor(this.pacer.charIndex);
      const word = block.words[indexAt(block.words, at)];
      setHighlight(H_WORD, word && at >= word.start - 1 ? rangeOf(block, word) : null);
      setHighlight(H_READ, rangeOf(block, { start: 0, end: word ? word.start : at }));
    } else {
      CSS.highlights.delete(H_READ);
    }

    this.positionVeil();
    this.paintBar();
    if (scroll) this.keepInView(block, sentence);
  }

  private queueReposition = (): void => {
    if (this.repositionQueued) return;
    this.repositionQueued = true;
    requestAnimationFrame(() => {
      this.repositionQueued = false;
      this.positionVeil();
    });
  };

  /** The veil is a hole: a box around the current block whose giant shadow dims the rest of the page. */
  private positionVeil(): void {
    const block = this.blocks[this.bi];
    if (!block) return;
    const r = block.el.getBoundingClientRect();
    const pad = 10;
    Object.assign(this.veil.style, {
      top: `${r.top - pad}px`,
      left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
  }

  private keepInView(block: Block, sentence: { start: number; end: number } | undefined): void {
    const target = sentence ? rangeOf(block, sentence)?.getBoundingClientRect() : block.el.getBoundingClientRect();
    if (!target) return;
    const top = innerHeight * 0.2;
    const bottom = innerHeight * 0.75;
    if (target.top >= top && target.bottom <= bottom) return;
    const scroller = scrollParent(block.el);
    const delta = target.top - innerHeight * 0.35;
    if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
    else window.scrollBy({ top: delta, behavior: 'smooth' });
  }

  // Bionic: the one feature that has to edit text nodes, so every wrapper is tracked and undone.

  private setBionic(on: boolean, rebuild: boolean): void {
    if (this.bionicWrappers.length) {
      const parents = new Set<Node>();
      for (const w of this.bionicWrappers) {
        if (w.parentNode) parents.add(w.parentNode);
        w.replaceWith(document.createTextNode(w.textContent ?? ''));
      }
      parents.forEach((p) => p.normalize());
      this.bionicWrappers = [];
    }
    if (on) {
      for (const block of this.blocks) {
        for (const node of block.nodes) {
          if (!node.isConnected || !node.data.trim()) continue;
          const wrap = document.createElement('fr-bionic');
          for (const part of splitWords(node.data)) {
            if (!part.isWord) {
              wrap.append(part.text);
              continue;
            }
            const n = boldLength(part.text, this.s.bionicRatio);
            const b = document.createElement('fr-b');
            b.textContent = part.text.slice(0, n);
            wrap.append(b, part.text.slice(n));
          }
          node.replaceWith(wrap);
          this.bionicWrappers.push(wrap);
        }
      }
    }
    // Text is unchanged, so offsets stay valid; only the node lists need rebuilding.
    if (rebuild || on) this.blocks = this.blocks.map((b) => buildBlock(b.el));
  }
}

function setHighlight(name: string, range: Range | null): void {
  if (range) CSS.highlights.set(name, new Highlight(range));
  else CSS.highlights.delete(name);
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Light veil on light pages, dark veil on dark pages. */
function veilColor(dim: number): string {
  let el: Element | null = document.body;
  let bg = 'rgb(255, 255, 255)';
  while (el) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && !/rgba\(.*,\s*0\)|transparent/.test(c)) {
      bg = c;
      break;
    }
    el = el === document.body ? document.documentElement : null;
  }
  const [r = 255, g = 255, b = 255] = (bg.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  return `rgba(${dark ? '0, 0, 0' : '255, 255, 255'}, ${(1 - dim).toFixed(2)})`;
}

function injectPageStyles(): void {
  if (document.getElementById('focus-reader-flow-styles')) return;
  const style = document.createElement('style');
  style.id = 'focus-reader-flow-styles';
  style.textContent = `
    focus-reader-ui.fr-veil {
      position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 10px;
      box-shadow: 0 0 0 200vmax var(--fr-veil);
      transition: top .22s ease, left .22s ease, width .22s ease, height .22s ease;
    }
    @media (prefers-reduced-motion: reduce) { focus-reader-ui.fr-veil { transition: none; } }
    ::highlight(${H_SENTENCE}) { background-color: rgba(255, 210, 0, .26); }
    ::highlight(${H_READ}) { color: color-mix(in srgb, currentColor 45%, transparent); }
    ::highlight(${H_WORD}) { background-color: rgba(255, 190, 0, .6); color: inherit; }
    fr-bionic { display: inline; }
    fr-b { font-weight: 700 !important; }`;
  document.head.appendChild(style);
}

const BAR_CSS = `
:host { all: initial; }
.bar {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 20px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-radius: 12px;
  background: #1f2328; color: #f4f4f4; font: 13px/1 system-ui, sans-serif;
  box-shadow: 0 8px 28px rgba(0,0,0,.28); max-width: calc(100vw - 32px); flex-wrap: wrap; justify-content: center;
}
button {
  font: inherit; color: inherit; background: transparent; border: 0; border-radius: 7px;
  padding: 7px 10px; cursor: pointer; min-width: 30px;
}
button:hover { background: rgba(255,255,255,.12); }
button.on { background: #f0b44c; color: #1f2328; }
button.pace { font-weight: 700; min-width: 40px; }
.pos, .wpm { opacity: .75; padding: 0 6px; font-variant-numeric: tabular-nums; }
.sep { width: 1px; height: 18px; background: rgba(255,255,255,.2); margin: 0 4px; }
`;
