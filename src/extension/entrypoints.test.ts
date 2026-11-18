import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import background from '../entrypoints/background';
import content from '../entrypoints/content';
import { startBackground } from './background/start';
import { startContentScript, type Send } from './content/content';
import { startPopup } from './popup/popup';

vi.mock('./background/start', () => ({ startBackground: vi.fn() }));
vi.mock('./content/content', () => ({
  startContentScript: vi.fn(() => Promise.resolve()),
}));
vi.mock('./popup/popup', () => ({ startPopup: vi.fn() }));

// WXT reads every file in src/entrypoints as an entrypoint, so their tests
// live here.

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the background entrypoint', () => {
  it('starts the background with the browser it runs in', () => {
    background.main();

    expect(startBackground).toHaveBeenCalledWith(browser);
  });
});

describe('the content script entrypoint', () => {
  it('registers at runtime, for the sites you turn on', () => {
    expect(content.registration).toBe('runtime');
  });

  it('starts in the page and talks to the background', async () => {
    const sendMessage = vi
      .spyOn(browser.runtime, 'sendMessage')
      .mockResolvedValue({ reload: null } as never);

    void content.main({} as never);
    const [win, send] = vi.mocked(startContentScript).mock.calls[0]! as [
      Window,
      Send,
    ];

    expect(win).toBe(window);
    await expect(send({ type: 'acknowledge' })).resolves.toEqual({
      reload: null,
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'acknowledge' });
  });
});

describe('the popup entrypoint', () => {
  it('opens on its page, and closes itself when done', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    await import('../entrypoints/popup/main');

    const [doc, api, done] = vi.mocked(startPopup).mock.calls[0]!;
    expect(doc).toBe(document);
    expect(api).toBe(browser);
    done();
    expect(close).toHaveBeenCalled();
  });
});
