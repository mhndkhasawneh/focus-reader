import { describe, expect, it } from 'vitest';
import { charsPerSecond, step, type PacerState } from '../lib/pacer';

const run = (text: string, pace: number, ms: number, pauses = false) => {
  let s: PacerState = { charIndex: 0, holdMs: 0 };
  for (let t = 0; t < ms; t += 16) s = step(s, 16, text, pace, pauses);
  return s;
};

describe('pacer', () => {
  it('maps pace 1-100 onto 10-100 chars per second', () => {
    expect(charsPerSecond(1)).toBe(10);
    expect(charsPerSecond(100)).toBe(100);
    expect(charsPerSecond(0)).toBe(10);
  });

  it('advances at the configured speed with 16 ms frames', () => {
    const s = run('x'.repeat(1000), 100, 1008); // 63 frames = 1.008 s at 100 cps
    expect(s.charIndex).toBeCloseTo(100.8, 0);
  });

  it('caps a single long frame at 50 ms', () => {
    const s = step({ charIndex: 0, holdMs: 0 }, 5000, 'x'.repeat(1000), 100, false);
    expect(s.charIndex).toBeCloseTo(5, 5);
  });

  it('stops at the end of the text', () => {
    expect(run('short', 100, 2000).charIndex).toBe(5);
  });

  it('never moves faster with punctuation pauses on', () => {
    const text = 'One. Two, three; four! '.repeat(20);
    expect(run(text, 60, 3000, true).charIndex).toBeLessThanOrEqual(run(text, 60, 3000, false).charIndex);
  });
});
