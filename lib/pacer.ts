// Auto-pacing: a cursor that moves through the text at a steady speed and the reader's eyes follow it.
// Pure and DOM-free so it can be unit-tested. The overlay maps `charIndex` onto word spans.

/** Pace 1-100 -> characters per second, linear from 10 to 100 cps. */
export function charsPerSecond(pace: number): number {
  const p = Math.min(100, Math.max(1, pace));
  return 10 + (p - 1) * (90 / 99);
}

/** Approximate words per minute for display, assuming ~6 chars per word including the space. */
export function wordsPerMinute(pace: number): number {
  return Math.round((charsPerSecond(pace) * 60) / 6);
}

/**
 * How long the cursor rests after passing `ch`, in milliseconds.
 * This sets the rhythm of auto-pacing: without pauses it feels robotic,
 * and with long pauses it feels sluggish.
 */
export function pauseAfter(ch: string, cps: number): number {
  // TODO: return a pause for sentence ends (. ! ?), clause breaks (, ; :) and 0 otherwise.
  // Consider scaling with `cps`, since a fast reader needs shorter rests.
  void ch;
  void cps;
  return 0;
}

export interface PacerState {
  charIndex: number;
  holdMs: number;
}

/** Advance the cursor by one animation frame of `dtMs` (capped at 50 ms so a background tab can't jump). */
export function step(state: PacerState, dtMs: number, text: string, pace: number, pauses: boolean): PacerState {
  let budget = Math.min(dtMs, 50);
  let { charIndex, holdMs } = state;
  const cps = charsPerSecond(pace);

  while (budget > 0 && charIndex < text.length) {
    if (holdMs > 0) {
      const used = Math.min(holdMs, budget);
      holdMs -= used;
      budget -= used;
      continue;
    }
    const msPerChar = 1000 / cps;
    // Time until the cursor crosses into the next character; frames are usually shorter than one char.
    const toNext = (Math.floor(charIndex) + 1 - charIndex) * msPerChar;
    if (budget < toNext) {
      charIndex += budget / msPerChar; // fractional progress, floored by the renderer
      break;
    }
    budget -= toNext;
    const ch = text[Math.floor(charIndex)] ?? '';
    charIndex = Math.floor(charIndex) + 1;
    if (pauses) holdMs = pauseAfter(ch, cps);
  }
  return { charIndex: Math.min(charIndex, text.length), holdMs };
}
