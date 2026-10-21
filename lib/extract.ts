import { Readability } from '@mozilla/readability';

export interface Article {
  title: string;
  byline: string | null;
  siteName: string | null;
  minutes: number;
  content: DocumentFragment;
}

const ALLOWED = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'EM', 'STRONG',
  'B', 'I', 'U', 'A', 'BR', 'HR', 'IMG', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH',
  'TD', 'SUP', 'SUB', 'SPAN', 'DIV', 'SECTION', 'ARTICLE', 'DL', 'DT', 'DD', 'MARK', 'SMALL', 'Q', 'CITE',
]);
const ATTRS: Record<string, string[]> = { A: ['href', 'title'], IMG: ['src', 'alt', 'srcset', 'width', 'height'] };

/** Keep only reading-relevant markup: no scripts, styles, iframes, event handlers or javascript: URLs. */
function sanitize(html: string, doc: Document): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const out = doc.createDocumentFragment();
  const copy = (src: Node, dst: Node) => {
    for (const child of Array.from(src.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        dst.appendChild(doc.createTextNode(child.textContent ?? ''));
      } else if (child instanceof Element) {
        if (!ALLOWED.has(child.tagName)) {
          if (!['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'svg'].includes(child.tagName)) copy(child, dst);
          continue;
        }
        const el = doc.createElement(child.tagName.toLowerCase());
        for (const name of ATTRS[child.tagName] ?? []) {
          const v = child.getAttribute(name);
          if (v && !/^\s*javascript:/i.test(v)) el.setAttribute(name, v);
        }
        if (el instanceof HTMLAnchorElement) {
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
        }
        copy(child, el);
        dst.appendChild(el);
      }
    }
  };
  copy(parsed.body, out);
  return out;
}

/** "Headline | Site Name" -> "Headline", unless that would leave almost nothing. */
export function stripSiteSuffix(title: string): string {
  const stripped = title.replace(/\s+[|–—·-]\s+[^|–—·]{2,40}$/, '');
  return stripped.length >= 12 ? stripped : title;
}

export function extractArticle(doc: Document = document): Article | null {
  // Readability mutates the document it is given, so it gets a clone.
  const result = new Readability(doc.cloneNode(true) as Document, { charThreshold: 300 }).parse();
  if (!result?.content) return null;
  const words = (result.textContent ?? '').split(/\s+/).filter(Boolean).length;
  return {
    title: stripSiteSuffix(result.title || doc.title),
    byline: result.byline ?? null,
    siteName: result.siteName ?? null,
    minutes: Math.max(1, Math.round(words / 230)),
    content: sanitize(result.content, doc),
  };
}
