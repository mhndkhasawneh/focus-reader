import type { Article } from './extract';
import { boldLength, splitWords } from './bionic';
import { step, wordsPerMinute, type PacerState } from './pacer';
import { FONTS, THEMES, saveSettings, type FontId, type Settings, type ThemeId } from './settings';

const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, figcaption, dd, td';
const THEME_ORDER: ThemeId[] = ['paper', 'sepia', 'mint', 'slate', 'night'];
const FONT_ORDER: FontId[] = ['lexend', 'atkinson', 'serif', 'original'];

interface Word {
  el: HTMLSpanElement;
  start: number;
  end: number;
  block: number;
}

export class ReaderOverlay {
  private host = document.createElement('focus-reader-root');
  private root = this.host.attachShadow({ mode: 'open' });
  private articleEl!: HTMLElement;
  private paceBtn!: HTMLButtonElement;
  private wpmLabel!: HTMLSpanElement;
  private words: Word[] = [];
  private blocks: HTMLElement[] = [];
  private text = '';
  private activeBlock = -1;
  private pacer: PacerState = { charIndex: 0, holdMs: 0 };
  private litWord = -1;
  private playing = false;
  private lastFrame = 0;
  private raf = 0;
  private prevOverflow = '';

  constructor(private article: Article, private s: Settings, private onClose: () => void) {}

  open(): void {
    this.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="fr" part="reader">
        <nav class="bar" aria-label="Focus Reader controls">
          <button data-act="close" title="Close (Esc)">✕</button>
          <span class="sep"></span>
          <button data-act="font" title="Font">Aa</button>
          <button data-act="smaller" title="Smaller (-)">A−</button>
          <button data-act="bigger" title="Bigger (+)">A+</button>
          <button data-act="theme" title="Theme">◐</button>
          <span class="sep"></span>
          <button data-act="bionic" title="Bionic text (B)"><b>Bi</b>onic</button>
          <button data-act="spotlight" title="Spotlight paragraph (F, ↑/↓)">Spotlight</button>
          <span class="sep"></span>
          <button data-act="slower" title="Slower ([)">−</button>
          <button data-act="pace" class="pace" title="Auto-pace (Space)">▶</button>
          <button data-act="faster" title="Faster (])">+</button>
          <span class="wpm"></span>
        </nav>
        <main class="page">
          <header>
            <p class="meta"></p>
            <h1 class="title"></h1>
          </header>
          <div class="content"></div>
        </main>
      </div>`;
    this.articleEl = this.root.querySelector('.content')!;
    this.paceBtn = this.root.querySelector('.pace')!;
    this.wpmLabel = this.root.querySelector('.wpm')!;
    this.root.querySelector('.title')!.textContent = this.article.title;
    this.root.querySelector('.meta')!.textContent = [this.article.siteName, this.article.byline, `${this.article.minutes} min read`]
      .filter(Boolean)
      .join(' · ');

    this.root.querySelector('nav')!.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act) this.act(act);
    });
    this.articleEl.addEventListener('click', (e) => this.onArticleClick(e));
    window.addEventListener('keydown', this.onKey, true);

    document.documentElement.appendChild(this.host);
    this.render();
  }

  close(): void {
    this.stopPace();
    window.removeEventListener('keydown', this.onKey, true);
    this.host.remove();
    document.documentElement.style.overflow = this.prevOverflow;
    this.onClose();
  }

  /** Apply settings changed elsewhere (e.g. the popup) without losing the reading position. */
  update(next: Settings): void {
    const rebuild = next.bionic !== this.s.bionic || next.bionicRatio !== this.s.bionicRatio;
    this.s = next;
    if (rebuild) this.render();
    else this.applyStyle();
  }

  private render(): void {
    this.articleEl.replaceChildren(this.article.content.cloneNode(true));
    this.blocks = Array.from(this.articleEl.querySelectorAll<HTMLElement>(BLOCKS)).filter((b) => !b.querySelector(BLOCKS));
    this.wrapWords();
    this.applyStyle();
    this.litWord = -1;
    this.paintPacer();
    this.setActiveBlock(this.activeBlock < 0 ? -1 : Math.min(this.activeBlock, this.blocks.length - 1), false);
  }

  /** Replace every text node with word spans so pacing and bionic can address single words. */
  private wrapWords(): void {
    this.words = [];
    this.text = '';
    const walker = document.createTreeWalker(this.articleEl, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    for (const node of nodes) {
      if (node.parentElement?.closest('pre, code')) {
        this.text += node.data;
        continue;
      }
      const block = this.blocks.findIndex((b) => b.contains(node));
      const frag = document.createDocumentFragment();
      for (const part of splitWords(node.data)) {
        const start = this.text.length;
        this.text += part.text;
        if (!part.isWord) {
          frag.appendChild(document.createTextNode(part.text));
          continue;
        }
        const span = document.createElement('span');
        span.className = 'w';
        if (this.s.bionic) {
          const n = boldLength(part.text, this.s.bionicRatio);
          const b = document.createElement('b');
          b.textContent = part.text.slice(0, n);
          span.append(b, part.text.slice(n));
        } else {
          span.textContent = part.text;
        }
        frag.appendChild(span);
        this.words.push({ el: span, start, end: this.text.length, block });
      }
      node.replaceWith(frag);
    }
  }

  private applyStyle(): void {
    const t = THEMES[this.s.theme];
    const fr = this.root.querySelector<HTMLElement>('.fr')!;
    fr.style.setProperty('--bg', t.bg);
    fr.style.setProperty('--fg', t.fg);
    fr.style.setProperty('--accent', t.accent);
    fr.style.setProperty('--mark', t.mark);
    fr.style.setProperty('--font', FONTS[this.s.font]);
    fr.style.setProperty('--size', `${this.s.fontSize}px`);
    fr.style.setProperty('--lh', String(this.s.lineHeight));
    fr.style.setProperty('--ls', `${this.s.letterSpacing}px`);
    fr.style.setProperty('--width', `${this.s.maxWidth}px`);
    fr.style.setProperty('--dim', String(this.s.spotlightDim));
    fr.classList.toggle('spotlight', this.s.spotlight);
    this.root.querySelector('[data-act="bionic"]')!.classList.toggle('on', this.s.bionic);
    this.root.querySelector('[data-act="spotlight"]')!.classList.toggle('on', this.s.spotlight);
    this.wpmLabel.textContent = `~${wordsPerMinute(this.s.pace)} wpm`;
    if (this.s.spotlight && this.activeBlock < 0) this.setActiveBlock(this.firstVisibleBlock(), false);
  }

  private set(patch: Partial<Settings>): void {
    this.update({ ...this.s, ...patch });
    void saveSettings(patch);
  }

  private act(act: string): void {
    const s = this.s;
    switch (act) {
      case 'close': return this.close();
      case 'font': return this.set({ font: FONT_ORDER[(FONT_ORDER.indexOf(s.font) + 1) % FONT_ORDER.length] });
      case 'theme': return this.set({ theme: THEME_ORDER[(THEME_ORDER.indexOf(s.theme) + 1) % THEME_ORDER.length] });
      case 'smaller': return this.set({ fontSize: Math.max(14, s.fontSize - 1) });
      case 'bigger': return this.set({ fontSize: Math.min(40, s.fontSize + 1) });
      case 'bionic': return this.set({ bionic: !s.bionic });
      case 'spotlight': return this.set({ spotlight: !s.spotlight });
      case 'slower': return this.set({ pace: Math.max(1, s.pace - 5) });
      case 'faster': return this.set({ pace: Math.min(100, s.pace + 5) });
      case 'pace': return this.playing ? this.stopPace() : this.startPace();
    }
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map: Record<string, string> = {
      Escape: 'close', ' ': 'pace', b: 'bionic', f: 'spotlight', '-': 'smaller', '=': 'bigger', '+': 'bigger',
      '[': 'slower', ']': 'faster',
    };
    const mapped = map[e.key];
    let handled = true;
    if (mapped) this.act(mapped);
    else if (e.key === 'ArrowDown' || e.key === 'j') this.moveBlock(1);
    else if (e.key === 'ArrowUp' || e.key === 'k') this.moveBlock(-1);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation(); // keep the page's own shortcuts from firing underneath
    }
  };

  private onArticleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('a')) return;
    const wordEl = target.closest('.w');
    const word = wordEl ? this.words.find((w) => w.el === wordEl) : undefined;
    if (word) {
      // Clicking a word moves the pacer there.
      this.pacer = { charIndex: word.start, holdMs: 0 };
      this.litWord = -1;
      this.paintPacer();
    }
    const block = this.blocks.findIndex((b) => b.contains(target));
    if (block >= 0) this.setActiveBlock(block, false);
  }

  // Spotlight

  private moveBlock(delta: number): void {
    if (!this.s.spotlight) this.set({ spotlight: true });
    const start = this.activeBlock < 0 ? this.firstVisibleBlock() - (delta > 0 ? 1 : 0) : this.activeBlock;
    this.setActiveBlock(Math.max(0, Math.min(this.blocks.length - 1, start + delta)), true);
  }

  private firstVisibleBlock(): number {
    const i = this.blocks.findIndex((b) => b.getBoundingClientRect().bottom > 80);
    return Math.max(0, i);
  }

  private setActiveBlock(i: number, scroll: boolean): void {
    this.blocks[this.activeBlock]?.classList.remove('active');
    this.activeBlock = i;
    const el = this.blocks[i];
    if (!el) return;
    el.classList.add('active');
    if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Auto-pace

  private startPace(): void {
    if (this.pacer.charIndex >= this.text.length) this.pacer = { charIndex: 0, holdMs: 0 };
    if (this.pacer.charIndex === 0 && this.s.spotlight && this.activeBlock >= 0) {
      const first = this.words.find((w) => w.block === this.activeBlock);
      if (first) this.pacer.charIndex = first.start;
    }
    this.playing = true;
    this.paceBtn.textContent = '❚❚';
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopPace(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this.paceBtn) this.paceBtn.textContent = '▶';
  }

  private tick = (now: number): void => {
    this.pacer = step(this.pacer, now - this.lastFrame, this.text, this.s.pace, this.s.pauseAtPunctuation);
    this.lastFrame = now;
    this.paintPacer();
    if (this.pacer.charIndex >= this.text.length) return this.stopPace();
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Highlight the word under the pacer cursor and mark everything before it as read. */
  private paintPacer(): void {
    const idx = this.wordAt(Math.floor(this.pacer.charIndex));
    if (idx === this.litWord) return;
    const from = Math.max(0, Math.min(idx, this.litWord));
    const to = Math.max(idx, this.litWord);
    for (let i = from; i <= to && i < this.words.length; i++) {
      const el = this.words[i]!.el;
      el.classList.toggle('read', i < idx);
      el.classList.toggle('now', i === idx);
    }
    if (this.litWord < 0) this.words.forEach((w, i) => w.el.classList.toggle('read', i < idx));
    this.litWord = idx;
    const word = this.words[idx];
    if (!word || !this.playing) return;
    if (word.block !== this.activeBlock && word.block >= 0) this.setActiveBlock(word.block, false);
    const r = word.el.getBoundingClientRect();
    if (r.top < innerHeight * 0.25 || r.bottom > innerHeight * 0.7) word.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  private wordAt(charIndex: number): number {
    if (!this.pacer.charIndex && !this.playing) return -1;
    let lo = 0;
    let hi = this.words.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.words[mid]!.start <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

const CSS = `
:host { all: initial; }
.fr {
  position: fixed; inset: 0; z-index: 2147483647; overflow-y: auto;
  background: var(--bg); color: var(--fg); font-family: var(--font);
  -webkit-font-smoothing: antialiased; color-scheme: light dark;
}
.bar {
  position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  justify-content: center; padding: 8px 16px; background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
  font: 13px/1 system-ui, sans-serif;
}
.bar button {
  font: inherit; color: var(--fg); background: transparent; border: 1px solid transparent; border-radius: 6px;
  padding: 6px 10px; cursor: pointer; min-width: 32px;
}
.bar button:hover { border-color: color-mix(in srgb, var(--fg) 25%, transparent); }
.bar button.on { background: var(--accent); color: var(--bg); }
.bar button.pace { min-width: 44px; font-weight: 600; }
.bar .sep { width: 1px; height: 18px; margin: 0 6px; background: color-mix(in srgb, var(--fg) 18%, transparent); }
.bar .wpm { opacity: .7; margin-left: 4px; font-variant-numeric: tabular-nums; }
.page { max-width: var(--width); margin: 0 auto; padding: 48px 24px 40vh; box-sizing: border-box; }
.meta { font: 14px/1.4 system-ui, sans-serif; opacity: .65; margin: 0 0 8px; }
.title { font-size: calc(var(--size) * 1.7); line-height: 1.2; margin: 0 0 32px; letter-spacing: -0.01em; }
.content { font-size: var(--size); line-height: var(--lh); letter-spacing: var(--ls); }
.content :is(p, li, blockquote, figcaption, dd) { margin: 0 0 1em; }
.content :is(h1, h2, h3, h4, h5, h6) { line-height: 1.3; margin: 1.6em 0 .6em; }
.content h1 { font-size: 1.55em; } .content h2 { font-size: 1.35em; } .content h3 { font-size: 1.2em; }
.content :is(h4, h5, h6) { font-size: 1.05em; }
.content a { color: var(--accent); }
.content img { max-width: 100%; height: auto; border-radius: 6px; }
.content pre { overflow-x: auto; font-size: .8em; line-height: 1.5; padding: 12px; border-radius: 6px;
  background: color-mix(in srgb, var(--fg) 7%, transparent); }
.content blockquote { border-left: 3px solid var(--accent); padding-left: 1em; margin-left: 0; }
.content b { font-weight: 700; }
.w b { font-weight: 750; }
.spotlight .content :is(${BLOCKS}) { opacity: var(--dim); transition: opacity .25s ease; }
.spotlight .content .active { opacity: 1; }
.w.read { opacity: .55; }
.w.now { background: var(--mark); border-radius: 3px; box-shadow: 0 0 0 2px var(--mark); opacity: 1; }
@media (prefers-reduced-motion: reduce) { .spotlight .content :is(${BLOCKS}) { transition: none; } }
`;
