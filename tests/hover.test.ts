// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findParagraph } from '../lib/hover';

const $ = (sel: string) => document.querySelector(sel)!;

describe('findParagraph', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="main">
        <article id="art">
          <p id="p">Plain <b id="bold">bold <i id="it">deep</i></b> text.</p>
          <div id="wrap"><span id="span">Text that lives in a span inside a div.</span></div>
          <ul><li id="li">An item <ul><li id="nested">A nested item</li></ul></li></ul>
          <div id="box"><p id="inner">Only blocks inside me.</p></div>
        </article>
      </main>
      <focus-reader-ui id="ui"><span id="uispan">Our own toolbar</span></focus-reader-ui>`;
  });

  it('returns the paragraph itself, or the paragraph around inline elements', () => {
    expect(findParagraph($('#p'))?.id).toBe('p');
    expect(findParagraph($('#it'))?.id).toBe('p');
  });

  it('treats a div whose text sits in inline children as a paragraph', () => {
    expect(findParagraph($('#span'))?.id).toBe('wrap');
    expect(findParagraph($('#wrap'))?.id).toBe('wrap');
  });

  it('picks the innermost list item', () => {
    expect(findParagraph($('#nested'))?.id).toBe('nested');
    expect(findParagraph($('#li'))?.id).toBe('li');
  });

  it('ignores containers that only hold other blocks', () => {
    expect(findParagraph($('#box'))).toBeNull();
    expect(findParagraph($('#art'))).toBeNull();
    expect(findParagraph(document.body)).toBeNull();
  });

  it('never highlights Focus Reader UI', () => {
    expect(findParagraph($('#uispan'))).toBeNull();
  });

  it('rejects blocks taller than the limit', () => {
    expect(findParagraph($('#p'), -1)).toBeNull();
  });
});
