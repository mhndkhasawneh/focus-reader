// Sentence and word segmentation for flow mode. Pure (no DOM) so it can be unit-tested.
import { WORD } from '../bionic';

export interface Span {
  start: number;
  end: number;
}

// Intl.Segmenter splits after these; Chrome ships no per-locale suppression data, so we merge them back.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'e.g', 'i.e', 'cf', 'al', 'fig', 'no',
  'vol', 'pp', 'approx', 'inc', 'ltd', 'co', 'corp', 'u.s', 'u.k', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul',
  'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

function endsWithAbbreviation(sentence: string): boolean {
  const m = sentence.trimEnd().match(/(?:^|[\s(])([\p{L}.]+)\.$/u);
  if (!m) return false;
  const word = m[1]!.toLowerCase();
  return ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word); // single initials: "J. R. R. Tolkien"
}

/** Sentence spans covering `text`, trailing whitespace excluded. */
export function sentences(text: string, locale?: string): Span[] {
  const raw: Span[] = [];
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  for (const s of segmenter.segment(text)) raw.push({ start: s.index, end: s.index + s.segment.length });

  const merged: Span[] = [];
  for (const span of raw) {
    const prev = merged[merged.length - 1];
    if (prev && endsWithAbbreviation(text.slice(prev.start, prev.end))) prev.end = span.end;
    else merged.push({ ...span });
  }
  return merged
    .map(({ start, end }) => {
      while (end > start && /\s/.test(text[end - 1]!)) end--;
      while (start < end && /\s/.test(text[start]!)) start++;
      return { start, end };
    })
    .filter((s) => s.end > s.start);
}

/** Word spans in `text`, using the same word definition as bionic text. */
export function words(text: string): Span[] {
  return Array.from(text.matchAll(WORD), (m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}
