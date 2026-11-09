// Hover highlight: a "reading finger" that puts a soft background behind the paragraph under the mouse.
// It needs nothing from the page's structure beyond the element under the pointer, so it still works on
// pages where in-page focus can't find the article. It marks one element with an attribute at a time and
// styles it from a single <style> element; nothing on the page moves or changes text.
import { DEFAULTS, type HoverCursor, type Settings } from './settings';

const ATTR = 'data-focus-reader-hover';
const OURS = 'focus-reader-ui, focus-reader-root';
/** While either of these is on the page, in-page focus or reader view is running and the finger steps aside. */
const BUSY = ':scope > focus-reader-root, :scope > focus-reader-ui.fr-veil';

/** True while in-page focus or reader view is open in this document. */
export const focusReaderBusy = () => document.documentElement.querySelector(BUSY) !== null;

const isInline = (el: Element) => {
  const d = getComputedStyle(el).display;
  return d.startsWith('inline') || d === 'contents' || d === 'ruby';
};

/** True if the block holds readable text itself (directly or through inline children), not only other blocks. */
function holdsText(block: Element): boolean {
  let n = 0;
  for (const child of block.childNodes) {
    if (++n > 200) break; // huge containers are never paragraphs; don't scan them
    if (child.nodeType === Node.TEXT_NODE && child.textContent!.trim()) return true;
    if (child instanceof Element && isInline(child) && child.textContent!.trim()) return true;
  }
  return false;
}

/**
 * The paragraph-like block to highlight for the element under the mouse, or null.
 * Walks up past inline elements (links, bold, spans) to the first block; that block counts only if it
 * holds text itself and isn't taller than `maxHeight` (so hovering a gap in a layout never lights up a column).
 */
export function findParagraph(start: Element | null, maxHeight = innerHeight): HTMLElement | null {
  if (!start || start.closest(OURS)) return null;
  let el: Element | null = start;
  while (el && isInline(el)) el = el.parentElement;
  if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;
  if (!holdsText(el)) return null;
  if (el.getBoundingClientRect().height > maxHeight) return null;
  return el;
}

export class HoverHighlighter {
  private style = document.createElement('style');
  private current: HTMLElement | null = null;
  private enabled = false;
  private busyWatch = new MutationObserver(() => focusReaderBusy() && this.clear());

  constructor(s: Settings) {
    this.update(s);
  }

  update(s: Settings): void {
    this.style.textContent = css(s.hoverColor, s.hoverCursor);
    if (s.hoverHighlight === this.enabled) return;
    this.enabled = s.hoverHighlight;
    if (this.enabled) {
      document.documentElement.appendChild(this.style);
      document.addEventListener('mouseover', this.onOver, { passive: true });
      document.documentElement.addEventListener('mouseleave', this.clear);
      // Our UI is appended straight to <html>, so watching its direct children is enough (and cheap).
      this.busyWatch.observe(document.documentElement, { childList: true });
    } else {
      this.clear();
      this.style.remove();
      document.removeEventListener('mouseover', this.onOver);
      document.documentElement.removeEventListener('mouseleave', this.clear);
      this.busyWatch.disconnect();
    }
  }

  private onOver = (e: MouseEvent) => {
    const next = focusReaderBusy() ? null : findParagraph(e.target as Element);
    if (next === this.current) return;
    this.clear();
    if (next) {
      next.setAttribute(ATTR, '');
      this.current = next;
    }
  };

  private clear = () => {
    this.current?.removeAttribute(ATTR);
    this.current = null;
  };
}

const safeColor = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULTS.hoverColor); // never let a stored value escape into CSS

function css(color: string, cursor: HoverCursor): string {
  color = safeColor(color);
  const svg = cursorSvg(cursor, color);
  // Translucent, so the same colour stays readable on light and dark sites.
  const tint = `color-mix(in srgb, ${color} 35%, transparent)`;
  return `[${ATTR}] {
    background-color: ${tint} !important;
    box-shadow: 0 0 0 6px ${tint} !important;
    border-radius: 6px !important;
    ${svg ? `cursor: url("${svgUrl(svg)}") ${HOTSPOT[cursor]}, pointer !important;` : ''}
  }`;
}

/** Scale each RGB channel of a #rrggbb colour (f < 1 darkens). */
const shade = (hex: string, f: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');

// A flat, tilted pointing hand. Drawn upright in a 100x120 box from overlapping shapes (one fill makes them a
// single silhouette), then rotated so the index finger points up and to the left.
const HAND = `<rect x='30' y='4' width='19' height='70' rx='9.5'/>
  <circle cx='57' cy='52' r='9.5'/><circle cx='71' cy='53' r='9.5'/><circle cx='84' cy='58' r='9'/>
  <path d='M30 50 H90 Q94 58 93 72 Q92 92 84 100 H44 Q32 96 28 86 Z'/>
  <path d='M34 92 Q22 74 10 76 Q2 78 4 86 Q16 92 30 106 Z'/>
  <rect x='42' y='92' width='44' height='28' rx='4'/>`;

export const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const HOTSPOT: Record<HoverCursor, string> = { normal: '', finger: '11 1', hand: '6 3', sleeve: '5 5' };

// A skin-tone hand in a blue cuff, drawn like HAND (upright, then tilted). Fixed colours: it doesn't take the
// highlight colour.
const SLEEVE_SKIN = `<rect x='31' y='-14' width='17' height='88' rx='8.5'/>
  <path d='M30 46 Q30 40 40 40 L76 44 Q88 46 88 58 L88 88 Q86 100 70 102 L42 102 Q28 98 26 84 Z'/>
  <path d='M32 74 Q20 66 12 52 Q8 44 14 41 Q20 39 25 47 L36 62 Z'/>
  <circle cx='56' cy='47' r='8.5'/><circle cx='70' cy='49' r='8.5'/><circle cx='81' cy='55' r='7.5'/>`;
const SLEEVE_CUFF = `<path d='M24 92 Q58 104 94 88 L98 112 Q60 128 22 114 Z'/>`;
const SLEEVE = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='-4 -10 116 120'>
  <defs><clipPath id='s'>${SLEEVE_SKIN}</clipPath></defs>
  <g transform='rotate(-28 50 60) translate(8 6) scale(0.8)'>
    <g fill='#9c6248' stroke='#9c6248' stroke-width='5' stroke-linejoin='round'>${SLEEVE_SKIN}</g>
    <g fill='#f3c9a8'>${SLEEVE_SKIN}</g>
    <path clip-path='url(#s)' fill='#e2a885' d='M90 44 Q80 70 62 84 Q52 94 54 110 H110 V44 Z'/>
    <rect x='34' y='-11' width='11' height='13' rx='5.5' fill='#fbe6da'/>
    <ellipse cx='15.5' cy='46' rx='4.5' ry='5.5' transform='rotate(-35 15.5 46)' fill='#fbe6da'/>
    <path d='M55 47 Q58 56 66 52 M69 50 Q72 58 79 56' fill='none' stroke='#c98a6a' stroke-width='2' stroke-linecap='round'/>
    <g fill='#1f4f80' stroke='#1f4f80' stroke-width='5' stroke-linejoin='round'>${SLEEVE_CUFF}</g>
    <g fill='#3f8fd6'>${SLEEVE_CUFF}</g>
    <path d='M28 109 Q60 121 95 106 L97 111 Q60 126 23 113 Z' fill='#2c6fae'/>
  </g></svg>`;

/** The cursor drawing for a style in the highlight colour, or null for the browser's normal cursor. */
export function cursorSvg(kind: HoverCursor, color: string): string | null {
  color = safeColor(color);
  if (kind === 'finger') {
    // Upright index finger with a dark outline; hotspot on the fingertip.
    return `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='32' viewBox='0 0 28 32'><path d='M9 2.5a2.5 2.5 0 0 1 5 0V13l1-.2a2.3 2.3 0 0 1 3 1.4l.2.6a2.3 2.3 0 0 1 3.4 1.2l.2.6a2.3 2.3 0 0 1 3.6 1.9V23c0 4.4-3.6 8-8 8h-3.2a8 8 0 0 1-6.3-3.1L3 21.8a2.4 2.4 0 0 1 3.6-3.1L9 21V2.5z' fill='${color}' stroke='#1f2328' stroke-width='1.5' stroke-linejoin='round'/></svg>`;
  }
  if (kind === 'hand') {
    // Flat two-tone hand, tilted so the finger points up and to the left.
    return `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='-2 -4 108 112'>
    <defs><clipPath id='h'>${HAND}</clipPath></defs>
    <g transform='rotate(-24 50 60) translate(4 -4) scale(0.86)'>
      <g fill='${shade(color, 0.62)}' stroke='${shade(color, 0.62)}' stroke-width='5' stroke-linejoin='round'>${HAND}</g>
      <g fill='${color}'>${HAND}</g>
      <path clip-path='url(#h)' fill='${shade(color, 0.92)}' d='M95 48 Q86 78 66 92 Q56 102 58 124 H110 V48 Z'/>
    </g></svg>`;
  }
  if (kind === 'sleeve') return SLEEVE;
  return null;
}
