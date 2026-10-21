// Bionic reading: bold the start of every word so the eye can fixate faster.
// Rule: bold ceil(len * ratio) letters, ratio clamped to 0.2-0.8, one-letter words fully bold.

export const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;

export function boldLength(word: string, ratio: number): number {
  if (word.length <= 1) return word.length;
  const r = Math.min(0.8, Math.max(0.2, ratio));
  return Math.max(1, Math.ceil(word.length * r));
}

export interface WordPart {
  text: string;
  isWord: boolean;
}

/** Split text into alternating word / non-word parts, preserving every character. */
export function splitWords(text: string): WordPart[] {
  const parts: WordPart[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), isWord: false });
    parts.push({ text: m[0], isWord: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), isWord: false });
  return parts;
}
