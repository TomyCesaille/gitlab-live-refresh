import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, scrollable } from '../../../test/dom';
import { memoryStore } from '../storage';
import {
  captureScroll,
  PANEL_SCROLLER,
  persistScroll,
  restoreScroll,
  savedScroll,
  saveScroll,
} from './scroll';

const url = 'https://gitlab.example.com/g/p/-/merge_requests/1';

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.documentElement.scrollTop = 0;
});

function panel(): HTMLElement {
  render('<div class="js-static-panel-inner"></div>');
  return document.querySelector(PANEL_SCROLLER)!;
}

describe('captureScroll', () => {
  it('reads the GitLab panel when it scrolls', () => {
    const element = panel();
    scrollable(element, { scrollHeight: 4_000, clientHeight: 800 });
    element.scrollTop = 1_500;

    expect(captureScroll(document, url)).toEqual({
      url,
      selector: PANEL_SCROLLER,
      top: 1_500,
    });
  });

  it('reads the document when the panel is short or absent', () => {
    scrollable(panel(), { scrollHeight: 500, clientHeight: 800 });
    expect(captureScroll(document, url).selector).toBeNull();

    document.body.innerHTML = '';
    expect(captureScroll(document, url)).toEqual({
      url,
      selector: null,
      top: 0,
    });
  });
});

describe('saved positions', () => {
  it('hands back the position saved for this page only', () => {
    const store = memoryStore();
    saveScroll(store, { url, selector: null, top: 10 });

    expect(savedScroll(store, url)?.top).toBe(10);
    expect(savedScroll(store, `${url}/diffs`)).toBeNull();
    expect(savedScroll(memoryStore(), url)).toBeNull();
  });

  it('saves where you are a moment after you stop scrolling', () => {
    const store = memoryStore();
    const element = panel();
    scrollable(element, { scrollHeight: 4_000, clientHeight: 800 });
    persistScroll(window, store, () => url);

    element.scrollTop = 300;
    element.dispatchEvent(new Event('scroll'));
    element.scrollTop = 600;
    element.dispatchEvent(new Event('scroll'));
    expect(savedScroll(store, url)).toBeNull();

    vi.advanceTimersByTime(250);
    expect(savedScroll(store, url)?.top).toBe(600);
  });
});

describe('restoreScroll', () => {
  const log = vi.fn();
  const quiet = { lastInputAt: () => 0, timeoutMs: 10_000, log };

  it('does nothing for a page that was at the top', () => {
    restoreScroll(document, { url, selector: null, top: 0 }, quiet);
    expect(log).not.toHaveBeenCalled();
  });

  it('waits for the page to grow back, then scrolls', () => {
    const element = panel();
    scrollable(element, { scrollHeight: 900, clientHeight: 800 });
    restoreScroll(
      document,
      { url, selector: PANEL_SCROLLER, top: 1_500 },
      quiet,
    );
    expect(element.scrollTop).toBe(0);

    scrollable(element, { scrollHeight: 4_000, clientHeight: 800 });
    vi.advanceTimersByTime(100);
    expect(element.scrollTop).toBe(1_500);
    expect(log).toHaveBeenLastCalledWith(
      'scroll restored to',
      1_500,
      'of',
      1_500,
    );
  });

  it('scrolls the document as far as it can once time is up', () => {
    scrollable(document.documentElement, {
      scrollHeight: 900,
      clientHeight: 800,
    });
    restoreScroll(document, { url, selector: null, top: 1_500 }, quiet);

    vi.advanceTimersByTime(10_000);
    expect(log).toHaveBeenCalledWith(
      'scroll restored to',
      expect.any(Number),
      'of',
      1_500,
    );
  });

  it('gives up when the scroller never shows up', () => {
    restoreScroll(
      document,
      { url, selector: PANEL_SCROLLER, top: 1_500 },
      quiet,
    );

    vi.advanceTimersByTime(20_000);
    expect(log).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves the page alone once you scroll or type first', () => {
    let lastInputAt = 0;
    scrollable(panel(), { scrollHeight: 900, clientHeight: 800 });
    restoreScroll(
      document,
      { url, selector: PANEL_SCROLLER, top: 1_500 },
      { ...quiet, lastInputAt: () => lastInputAt },
    );

    lastInputAt = 50;
    vi.advanceTimersByTime(100);
    expect(log).toHaveBeenCalledWith(
      'scroll restore dropped: input came first',
    );
  });
});
