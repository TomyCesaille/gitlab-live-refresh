import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen, render } from '../../../test/dom';
import {
  hasUnsentText,
  isBusy,
  isTextEntry,
  isVisible,
  reloadBlocker,
  trackActivity,
} from './blockers';

const idle = { lastInputAt: 0, now: 100_000, idleMs: 8_000, arriving: false };

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
  vi.useRealTimers();
});

describe('isVisible', () => {
  it('counts an element with a size as on screen', () => {
    render('<div id="a"></div>');
    expect(isVisible(onScreen(document.getElementById('a')!))).toBe(true);
  });

  it('counts an element without a size, or hidden by CSS, as off screen', () => {
    render('<div id="a"></div><div id="b"></div>');
    const hidden = onScreen(document.getElementById('b')!);
    vi.spyOn(hidden, 'checkVisibility').mockReturnValue(false);

    expect(isVisible(document.getElementById('a')!)).toBe(false);
    expect(isVisible(hidden)).toBe(false);
  });
});

describe('isTextEntry', () => {
  it.each([
    ['<textarea></textarea>', true],
    ['<input type="search">', true],
    ['<input>', true],
    ['<div contenteditable="true"></div>', true],
    ['<input type="checkbox">', false],
    ['<button></button>', false],
  ])('reads %s as text entry: %s', (html, expected) => {
    render(html);
    expect(isTextEntry(document.body.firstElementChild)).toBe(expected);
  });

  it('reads no focused element as no text entry', () => {
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('hasUnsentText', () => {
  it('sees a draft in a visible textarea or rich text editor', () => {
    render('<textarea>draft</textarea>');
    onScreen(document.querySelector('textarea')!);
    expect(hasUnsentText(document)).toBe(true);

    render('<div contenteditable="true">draft</div>');
    onScreen(document.querySelector('div')!);
    expect(hasUnsentText(document)).toBe(true);
  });

  it('ignores empty or hidden fields: GitLab keeps several of those', () => {
    render('<textarea>  </textarea><textarea>hidden draft</textarea>');
    onScreen(document.querySelector('textarea')!);
    expect(hasUnsentText(document)).toBe(false);
  });
});

describe('isBusy', () => {
  it('is busy while typing or with a draft on screen', () => {
    render('<input id="q"><textarea>draft</textarea>');
    expect(isBusy(document)).toBe(false);

    onScreen(document.querySelector('textarea')!);
    expect(isBusy(document)).toBe(true);

    render('<input id="q">');
    document.getElementById('q')!.focus();
    expect(isBusy(document)).toBe(true);
  });
});

describe('reloadBlocker', () => {
  it('lets a reload through when nothing holds it', () => {
    expect(reloadBlocker(document, idle)).toBeNull();
  });

  it('holds it while you type', () => {
    render('<textarea></textarea>');
    document.querySelector('textarea')!.focus();
    expect(reloadBlocker(document, idle)).toBe('typing');
  });

  it('holds it for unsent text', () => {
    render('<textarea>draft</textarea>');
    onScreen(document.querySelector('textarea')!);
    expect(reloadBlocker(document, idle)).toBe('unsent');
  });

  it('holds it while text is selected', () => {
    render('<p>some text</p>');
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('p')!);
    window.getSelection()!.addRange(range);
    expect(reloadBlocker(document, idle)).toBe('selection');
  });

  it('reads a document without a selection object as nothing selected', () => {
    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    expect(reloadBlocker(document, idle)).toBeNull();
  });

  it('holds it while a dialog or menu is open, not while one is hidden', () => {
    render('<div role="dialog"></div><div role="menu"></div>');
    expect(reloadBlocker(document, idle)).toBeNull();

    onScreen(document.querySelector('[role="menu"]')!);
    expect(reloadBlocker(document, idle)).toBe('overlay');
  });

  it('holds it while you are active, except on arrival', () => {
    const active = { ...idle, lastInputAt: idle.now - 1_000 };
    expect(reloadBlocker(document, active)).toBe('active');
    expect(reloadBlocker(document, { ...active, arriving: true })).toBeNull();
  });
});

describe('trackActivity', () => {
  it('records the last input of any kind', () => {
    vi.useFakeTimers({ now: 1_000 });
    const lastInputAt = trackActivity(window);
    expect(lastInputAt()).toBe(1_000);

    vi.setSystemTime(5_000);
    window.dispatchEvent(new Event('keydown'));
    expect(lastInputAt()).toBe(5_000);

    vi.setSystemTime(9_000);
    document.body.dispatchEvent(new Event('scroll'));
    expect(lastInputAt()).toBe(9_000);
  });
});
