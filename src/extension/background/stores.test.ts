import { afterEach, describe, expect, it, vi } from 'vitest';
import { memorySessionArea } from '../../../test/extension';
import { detectPage } from '../../core/page';
import { emptyTracker } from '../../core/tracker';
import { CONTENT_SCRIPT_ID, syncContentScripts, type SitesApi } from './sites';
import { fingerprintSource } from './source';
import { tabStore, type TabState } from './tabs';

afterEach(() => {
  vi.useRealTimers();
});

const state = (url: string): TabState => ({
  origin: 'https://gitlab.example.com',
  url,
  page: null,
  visible: true,
  busy: false,
  tracker: emptyTracker(),
  lastSeenAt: 0,
  lastPollAt: 0,
  lastAutoReloadAt: 0,
  reload: null,
});

describe('tabStore', () => {
  it('keeps one state per tab, apart from other session data', async () => {
    const area = memorySessionArea();
    await area.set({ unrelated: 1 });
    const tabs = tabStore(area);

    await tabs.set(1, state('a'));
    await tabs.set(2, state('b'));
    expect(await tabs.get(1)).toEqual(state('a'));
    expect(await tabs.get(3)).toBeNull();
    expect(await tabs.all()).toEqual([
      [1, state('a')],
      [2, state('b')],
    ]);

    await tabs.remove(1);
    expect(await tabs.get(1)).toBeNull();
  });
});

describe('fingerprintSource', () => {
  const page = detectPage({
    pathname: '/g/p/-/jobs/3',
    search: '',
  })!;

  function setup() {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response('{"status":"running"}')),
    );
    return { fetch, source: fingerprintSource(fetch, 1_000) };
  }

  it('reads the page from its GitLab instance', async () => {
    const { fetch, source } = setup();

    await expect(
      source.get('https://gitlab.example.com', page, 0),
    ).resolves.toEqual({ status: 'running' });
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://gitlab.example.com/api/v4/projects/g%2Fp/jobs/3',
    );
  });

  it('shares a fresh read between tabs on the same page', async () => {
    vi.useFakeTimers({ now: 0 });
    const { fetch, source } = setup();

    await source.get('https://gitlab.example.com', page, 10_000);
    vi.setSystemTime(5_000);
    await source.get('https://gitlab.example.com', page, 10_000);
    expect(fetch).toHaveBeenCalledOnce();

    await source.get('https://gitlab.example.com', page, 0);
    await source.get('https://other.example.com', page, 10_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not keep a failed read', async () => {
    const { fetch, source } = setup();
    fetch.mockResolvedValueOnce(new Response('{}', { status: 502 }));

    await expect(
      source.get('https://gitlab.example.com', page, 10_000),
    ).rejects.toThrow('502');
    await expect(
      source.get('https://gitlab.example.com', page, 10_000),
    ).resolves.toEqual({ status: 'running' });
  });

  it('keeps a newer read when an older one fails', async () => {
    const { fetch, source } = setup();
    let fail: (response: Response) => void = () => undefined;
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        fail = resolve;
      }),
    );

    const older = source.get('https://gitlab.example.com', page, 10_000);
    await source.get('https://gitlab.example.com', page, 0);
    fail(new Response('{}', { status: 502 }));
    await expect(older).rejects.toThrow();

    await source.get('https://gitlab.example.com', page, 10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('forgets reads older than a minute', async () => {
    vi.useFakeTimers({ now: 0 });
    const { fetch, source } = setup();

    await source.get('https://gitlab.example.com', page, 120_000);
    vi.setSystemTime(61_000);
    await source.get('https://gitlab.example.com', page, 120_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('syncContentScripts', () => {
  function api(origins: string[] | undefined, registered: string[]) {
    return {
      permissions: {
        getAll: vi.fn(() => Promise.resolve(origins ? { origins } : {})),
      },
      scripting: {
        getRegisteredContentScripts: vi.fn(() =>
          Promise.resolve(registered.map((id) => ({ id }))),
        ),
        unregisterContentScripts: vi.fn(() => Promise.resolve()),
        registerContentScripts: vi.fn(() => Promise.resolve()),
      },
    } satisfies SitesApi;
  }

  it('runs the content script on every site you turned on', async () => {
    const sites = api(
      ['https://gitlab.example.com/*', 'https://gitlab.com/*'],
      [],
    );

    await expect(syncContentScripts(sites, 'content.js')).resolves.toEqual([
      'https://gitlab.example.com/*',
      'https://gitlab.com/*',
    ]);
    expect(sites.scripting.unregisterContentScripts).not.toHaveBeenCalled();
    expect(sites.scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: CONTENT_SCRIPT_ID,
        matches: ['https://gitlab.example.com/*', 'https://gitlab.com/*'],
        js: ['content.js'],
        runAt: 'document_idle',
        persistAcrossSessions: false,
      },
    ]);
  });

  it('replaces the previous registration', async () => {
    const sites = api(['https://gitlab.com/*'], [CONTENT_SCRIPT_ID]);

    await syncContentScripts(sites, 'content.js');
    expect(sites.scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [CONTENT_SCRIPT_ID],
    });
    expect(sites.scripting.registerContentScripts).toHaveBeenCalled();
  });

  it('runs nowhere once every site is turned off', async () => {
    const sites = api(undefined, [CONTENT_SCRIPT_ID]);

    await expect(syncContentScripts(sites, 'content.js')).resolves.toEqual([]);
    expect(sites.scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});
