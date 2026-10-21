import { describe, expect, it } from 'vitest';
import { boldLength, splitWords } from '../lib/bionic';

describe('boldLength', () => {
  it('bolds ceil(len * ratio) letters', () => {
    expect(boldLength('reading', 0.4)).toBe(3);
    expect(boldLength('focus', 0.4)).toBe(2);
  });
  it('fully bolds one-letter words', () => expect(boldLength('a', 0.4)).toBe(1));
  it('clamps the ratio to 0.2-0.8', () => {
    expect(boldLength('abcdefghij', 0.01)).toBe(2);
    expect(boldLength('abcdefghij', 1)).toBe(8);
  });
});

describe('splitWords', () => {
  it('preserves every character', () => {
    const text = "It's 9:30 — naïve co-op, “quoted”!";
    expect(splitWords(text).map((p) => p.text).join('')).toBe(text);
  });
  it('keeps apostrophes, hyphens and accents inside words', () => {
    const words = splitWords("don't co-op naïve").filter((p) => p.isWord).map((p) => p.text);
    expect(words).toEqual(["don't", 'co-op', 'naïve']);
  });
});
