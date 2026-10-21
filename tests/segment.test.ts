import { describe, expect, it } from 'vitest';
import { sentences, words } from '../lib/flow/segment';

const cut = (text: string) => sentences(text).map((s) => text.slice(s.start, s.end));

describe('sentences', () => {
  it('splits plain sentences and trims whitespace', () => {
    expect(cut('One idea. Another one!  A question?')).toEqual(['One idea.', 'Another one!', 'A question?']);
  });

  it('does not split after common abbreviations or initials', () => {
    expect(cut('Dr. Smith met Mrs. Jones, e.g. at noon. J. R. R. Tolkien wrote it.')).toEqual([
      'Dr. Smith met Mrs. Jones, e.g. at noon.',
      'J. R. R. Tolkien wrote it.',
    ]);
  });

  it('keeps decimals and times intact', () => {
    expect(cut('It costs 3.50 today. Meet at 9:30.')).toEqual(['It costs 3.50 today.', 'Meet at 9:30.']);
  });

  it('handles text without terminal punctuation', () => {
    expect(cut('A heading without a period')).toEqual(['A heading without a period']);
  });
});

describe('words', () => {
  it('finds words with apostrophes and hyphens', () => {
    const text = "Don't over-think it.";
    expect(words(text).map((w) => text.slice(w.start, w.end))).toEqual(["Don't", 'over-think', 'it']);
  });
});
