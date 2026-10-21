// Maps the live page's reading blocks to plain text, so sentences and words can be addressed by offset
// and turned back into DOM Ranges. Nothing here mutates the page.
import { sentences, words, type Span } from './segment';

export const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, figcaption, td';
const SKIP = 'nav, header, footer, aside, form, button, select, textarea, [contenteditable], [role="navigation"], [aria-hidden="true"], focus-reader-root, focus-reader-ui';

export interface Block {
  el: HTMLElement;
  nodes: Text[];
  starts: number[]; // offset of each text node within `text`
  text: string;
  sentences: Span[];
  words: Span[];
}

function isReadable(el: HTMLElement): boolean {
  if (el.closest(SKIP)) return false;
  if (el.querySelector(BLOCKS)) return false; // only leaf blocks
  if (el.getClientRects().length === 0) return false; // display:none / detached
  return (el.textContent ?? '').trim().split(/\s+/).length >= 3 || /^H[1-6]$/.test(el.tagName);
}

function textNodes(el: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('script, style, noscript, sup.reference') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  while (walker.nextNode()) out.push(walker.currentNode as Text);
  return out;
}

export function buildBlock(el: HTMLElement): Block {
  const nodes = textNodes(el);
  const starts: number[] = [];
  let text = '';
  for (const n of nodes) {
    starts.push(text.length);
    text += n.data;
  }
  return { el, nodes, starts, text, sentences: sentences(text, document.documentElement.lang || undefined), words: words(text) };
}

/** The article-like container around `from`: the nearest ancestor holding at least 3 paragraphs. */
export function findContainer(from: Element): HTMLElement {
  let el: Element | null = from;
  for (let i = 0; i < 12 && el && el !== document.body; i++) {
    if (el.querySelectorAll(':scope p').length >= 3) return el as HTMLElement;
    el = el.parentElement;
  }
  return document.body;
}

export function collectBlocks(container: HTMLElement): Block[] {
  return Array.from(container.querySelectorAll<HTMLElement>(BLOCKS)).filter(isReadable).map(buildBlock);
}

/** Offset of a DOM position (node, offset) inside `block.text`, or -1 if it isn't in the block. */
export function offsetOf(block: Block, node: Node, offset: number): number {
  const i = block.nodes.indexOf(node as Text);
  if (i >= 0) return block.starts[i]! + offset;
  // Position is on an element: use the first text node at or after it.
  const target = node.childNodes[offset] ?? node;
  for (let j = 0; j < block.nodes.length; j++) {
    const pos = target.compareDocumentPosition(block.nodes[j]!);
    if (target === block.nodes[j] || pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY) {
      return block.starts[j]!;
    }
  }
  return block.el.contains(node) ? block.text.length : -1;
}

function locate(block: Block, offset: number): [Text, number] {
  let lo = 0;
  let hi = block.nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (block.starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  const node = block.nodes[lo]!;
  return [node, Math.min(node.length, offset - block.starts[lo]!)];
}

export function rangeOf(block: Block, span: Span): Range | null {
  if (block.nodes.length === 0) return null;
  const range = document.createRange();
  const [sn, so] = locate(block, span.start);
  const [en, eo] = locate(block, Math.max(span.start, span.end));
  range.setStart(sn, so);
  range.setEnd(en, eo);
  return range;
}

export function indexAt(spans: Span[], offset: number): number {
  const i = spans.findIndex((s) => offset < s.end);
  return i < 0 ? spans.length - 1 : i;
}
