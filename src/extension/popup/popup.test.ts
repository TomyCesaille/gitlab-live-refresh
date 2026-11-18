import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPopup, type PopupApi } from './popup';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup(tab: { id?: number; url?: string } | undefined, on = false) {
  const api = {
    tabs: {
      query: vi.fn(() => Promise.resolve(tab ? [tab] : [])),
      reload: vi.fn(() => Promise.resolve()),
    },
    permissions: {
      contains: vi.fn(() => Promise.resolve(on)),
      request: vi.fn(() => Promise.resolve(true)),
      remove: vi.fn(() => Promise.resolve(true)),
    },
    runtime: { sendMessage: vi.fn(() => Promise.resolve([])) },
  } satisfies PopupApi;
  const close = vi.fn();
  return { api, close, start: () => startPopup(document, api, close) };
}

const status = () => document.querySelector('p')?.textContent;
const button = () => document.querySelector('button');
const origins = ['https://gitlab.example.com/*'];
const gitlabTab = { id: 7, url: 'https://gitlab.example.com/g/p/-/pipelines' };

describe('startPopup', () => {
  it.each([
    ['no tab', undefined],
    ['a page that is not https', { id: 1, url: 'http://intranet/' }],
    ['a tab without a URL', { id: 1 }],
    ['a tab without an id', { url: 'https://gitlab.example.com/' }],
  ])('points to a GitLab page from %s', async (_, tab) => {
    const { start } = setup(tab);

    await start();
    expect(status()).toBe(
      'Open a GitLab page, then click here to turn live refresh on for its site.',
    );
    expect(button()).toBeNull();
  });

  it('turns live refresh on for the site, then reloads the tab', async () => {
    const { api, close, start } = setup(gitlabTab);
    await start();
    expect(status()).toBe('Live refresh is off for gitlab.example.com.');
    expect(button()?.textContent).toBe('Turn on for gitlab.example.com');

    button()!.click();
    expect(api.permissions.request).toHaveBeenCalledWith({ origins });
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
    expect(api.runtime.sendMessage).toHaveBeenCalledWith({ type: 'sites' });
    expect(api.tabs.reload).toHaveBeenCalledWith(7);
  });

  it('turns it off for the site', async () => {
    const { api, close, start } = setup(gitlabTab, true);
    await start();
    expect(status()).toBe('Live refresh is on for gitlab.example.com.');

    button()!.click();
    expect(api.permissions.remove).toHaveBeenCalledWith({ origins });
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
  });

  it('stays open when you decline the permission', async () => {
    const { api, close, start } = setup(gitlabTab);
    api.permissions.request.mockResolvedValueOnce(false);
    await start();

    button()!.click();
    await vi.waitFor(() => {
      expect(api.permissions.request).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(api.tabs.reload).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
