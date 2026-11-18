import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memorySessionArea } from '../../../test/extension';
import type { Fingerprint } from '../../core/fingerprint';
import { detectPage, type PageRef } from '../../core/page';
import { TIMING } from '../../core/timing';
import { NOTHING_NEW, type ToBackground } from '../messages';
import { createBackground } from './background';
import { tabStore } from './tabs';

const ORIGIN = 'https://gitlab.example.com';
const URL_1 = `${ORIGIN}/g/p/-/merge_requests/1`;
const page = detectPage({
  pathname: '/g/p/-/merge_requests/1',
  search: '',
})!;

function setup() {
  const area = memorySessionArea();
  const tabs = tabStore(area);
  let server: Fingerprint = { pipeline: '1:running', updatedAt: 't0' };
  const get = vi.fn((_origin: string, _page: PageRef, _maxAgeMs: number) =>
    Promise.resolve(server),
  );
  const reloadTab = vi.fn((_tabId: number) => Promise.resolve());
  const log = vi.fn();
  const background = createBackground({
    tabs,
    source: { get },
    reloadTab,
    timing: TIMING,
    log,
  });
  const send = (tabId: number, message: ToBackground) =>
    background.handle(tabId, ORIGIN, message);
  const hello = (tabId = 1, overrides: Partial<ToBackground> = {}) =>
    send(tabId, {
      type: 'hello',
      page,
      url: URL_1,
      visible: true,
      busy: false,
      ...overrides,
    } as ToBackground);
  return {
    tabs,
    get,
    reloadTab,
    log,
    background,
    send,
    hello,
    serverIs(next: Fingerprint) {
      server = next;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 10_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hello', () => {
  it('takes a fresh baseline for the page that loaded', async () => {
    const { hello, get, tabs } = setup();

    await expect(hello()).resolves.toEqual({ reload: null });
    expect(get).toHaveBeenCalledWith(ORIGIN, page, 0);
    expect(await tabs.get(1)).toMatchObject({
      origin: ORIGIN,
      url: URL_1,
      visible: true,
      lastPollAt: Date.now(),
      tracker: { changed: [] },
    });
  });

  it('only remembers a page it does not follow', async () => {
    const { hello, get, tabs } = setup();

    await hello(1, { page: null });
    expect(get).not.toHaveBeenCalled();
    expect(await tabs.get(1)).toMatchObject({ page: null, lastPollAt: 0 });
  });

  it('hands the reload marker to the page that loads after it', async () => {
    const { hello, send } = setup();
    await hello();
    await send(1, {
      type: 'reloading',
      reason: 'changed: pipeline',
      manual: false,
    });

    vi.advanceTimersByTime(2_000);
    const reply = await hello();
    expect(reply).toEqual({
      reload: {
        url: URL_1,
        at: Date.now() - 2_000,
        manual: false,
        reason: 'changed: pipeline',
      },
    });
  });

  it('starts the reload gap from an automatic reload, not from one you asked for', async () => {
    const { hello, send, tabs } = setup();
    await hello();
    await send(1, {
      type: 'reloading',
      reason: 'changed: pipeline',
      manual: false,
    });
    await hello();
    expect((await tabs.get(1))?.lastAutoReloadAt).toBe(Date.now());

    await send(1, { type: 'reloading', reason: 'banner button', manual: true });
    await hello();
    expect((await tabs.get(1))?.lastAutoReloadAt).toBe(0);
  });

  it('ignores a marker for another page or from long ago', async () => {
    const { hello, send } = setup();
    await hello();
    await send(1, { type: 'reloading', reason: 'x', manual: false });
    await expect(hello(1, { url: `${URL_1}/diffs` })).resolves.toEqual({
      reload: null,
    });

    await send(1, { type: 'reloading', reason: 'x', manual: false });
    vi.advanceTimersByTime(60_000);
    await expect(hello()).resolves.toEqual({ reload: null });
  });

  it('starts without a baseline when GitLab does not answer', async () => {
    const { hello, get, tabs, log } = setup();
    get.mockRejectedValueOnce(new Error('offline'));

    await hello();
    expect((await tabs.get(1))?.tracker.snapshot).toBeNull();
    expect(log).toHaveBeenCalledWith('poll failed', 'Error: offline');
  });
});

describe('check', () => {
  it('reports what changed since the page loaded', async () => {
    const { hello, send, serverIs } = setup();
    await hello();
    serverIs({ pipeline: '1:success', updatedAt: 't1' });

    vi.advanceTimersByTime(15_000);
    await expect(send(1, { type: 'check', arriving: false })).resolves.toEqual({
      changed: ['pipeline', 'updatedAt'],
      lastMoveAt: Date.now(),
      lastAutoReloadAt: 0,
      failed: false,
    });
  });

  it('shares a recent read, except on arrival', async () => {
    const { hello, send, get } = setup();
    await hello();

    await send(1, { type: 'check', arriving: false });
    expect(get).toHaveBeenLastCalledWith(ORIGIN, page, 10_000);
    await send(1, { type: 'check', arriving: true });
    expect(get).toHaveBeenLastCalledWith(ORIGIN, page, 0);
  });

  it('says when GitLab did not answer', async () => {
    const { hello, send, get } = setup();
    await hello();
    get.mockRejectedValueOnce(new Error('502'));

    await expect(
      send(1, { type: 'check', arriving: false }),
    ).resolves.toMatchObject({
      failed: true,
    });
  });

  it('has nothing to say about a tab it does not know or follow', async () => {
    const { hello, send } = setup();
    await expect(send(9, { type: 'check', arriving: false })).resolves.toBe(
      NOTHING_NEW,
    );

    await hello(2, { page: null });
    await expect(send(2, { type: 'check', arriving: false })).resolves.toBe(
      NOTHING_NEW,
    );
  });
});

describe('away and acknowledge', () => {
  it('notes that the tab went to the background, and with what on it', async () => {
    const { hello, send, tabs } = setup();
    await hello();

    await send(1, { type: 'away', busy: true });
    expect(await tabs.get(1)).toMatchObject({ visible: false, busy: true });
  });

  it('takes what the server shows now as the new normal', async () => {
    const { hello, send, serverIs } = setup();
    await hello();
    serverIs({ pipeline: '1:success', updatedAt: 't1' });
    await send(1, { type: 'check', arriving: true });

    await send(1, { type: 'acknowledge' });
    await expect(
      send(1, { type: 'check', arriving: true }),
    ).resolves.toMatchObject({
      changed: [],
    });
  });

  it('ignores messages from a tab it never met', async () => {
    const { send, tabs } = setup();

    await send(5, { type: 'away', busy: false });
    expect(await tabs.get(5)).toBeNull();
  });
});

describe('sweep', () => {
  async function awayTab(context: ReturnType<typeof setup>, busy = false) {
    await context.hello();
    await context.send(1, { type: 'away', busy });
    vi.advanceTimersByTime(60_000);
  }

  it('reloads a background tab when something urgent changed', async () => {
    const context = setup();
    await awayTab(context);
    context.serverIs({ pipeline: '1:failed', updatedAt: 't1' });

    await context.background.sweep();
    expect(context.reloadTab).toHaveBeenCalledWith(1);
    expect(await context.tabs.get(1)).toMatchObject({
      lastAutoReloadAt: Date.now(),
      reload: {
        url: URL_1,
        manual: false,
        reason: 'changed: pipeline, updatedAt',
      },
    });
  });

  it('reads it without reloading while nothing changed', async () => {
    const context = setup();
    await awayTab(context);

    await context.background.sweep();
    expect(context.get).toHaveBeenCalledTimes(2);
    expect(context.reloadTab).not.toHaveBeenCalled();
  });

  it('never reloads a tab you left unsent work on', async () => {
    const context = setup();
    await awayTab(context, true);
    context.serverIs({ pipeline: '1:failed', updatedAt: 't1' });

    await context.background.sweep();
    expect(context.reloadTab).not.toHaveBeenCalled();
  });

  it('leaves the visible tab to its page', async () => {
    const context = setup();
    await context.hello();
    vi.advanceTimersByTime(30_000);

    await context.background.sweep();
    expect(context.get).toHaveBeenCalledOnce();
  });

  it('takes over a visible tab that stopped checking in: it is frozen', async () => {
    const context = setup();
    await context.hello();
    context.serverIs({ pipeline: '1:failed', updatedAt: 't1' });
    vi.advanceTimersByTime(60_000);

    await context.background.sweep();
    expect(context.reloadTab).toHaveBeenCalledWith(1);
  });

  it('reads a background tab at most once a minute', async () => {
    const context = setup();
    await awayTab(context);
    await context.background.sweep();

    vi.advanceTimersByTime(30_000);
    await context.background.sweep();
    expect(context.get).toHaveBeenCalledTimes(2);
  });

  it('skips tabs on pages it does not follow', async () => {
    const context = setup();
    await context.hello(1, {
      page: null,
      visible: false,
    });
    vi.advanceTimersByTime(60_000);

    await context.background.sweep();
    expect(context.get).not.toHaveBeenCalled();
  });

  it('forgets a tab that closed before its reload', async () => {
    const context = setup();
    await awayTab(context);
    context.serverIs({ pipeline: '1:failed', updatedAt: 't1' });
    context.reloadTab.mockRejectedValueOnce(new Error('No tab with id: 1'));

    await context.background.sweep();
    expect(await context.tabs.get(1)).toBeNull();
  });
});

describe('ordering', () => {
  it('handles one message at a time per tab', async () => {
    const context = setup();
    await context.hello();
    let finishRead: (fingerprint: Fingerprint) => void = () => undefined;
    context.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );

    const check = context.send(1, { type: 'check', arriving: false });
    const away = context.send(1, { type: 'away', busy: false });
    finishRead({ pipeline: '1:running', updatedAt: 't0' });
    await Promise.all([check, away]);

    expect((await context.tabs.get(1))?.visible).toBe(false);
  });

  it('keeps going after a message fails', async () => {
    const context = setup();
    await context.hello();
    vi.spyOn(context.tabs, 'get').mockRejectedValueOnce(new Error('storage'));

    await expect(
      context.send(1, { type: 'away', busy: false }),
    ).rejects.toThrow('storage');
    await context.send(1, { type: 'away', busy: true });
    expect((await context.tabs.get(1))?.busy).toBe(true);
  });

  it('forgets a closed tab', async () => {
    const context = setup();
    await context.hello();

    await context.background.forget(1);
    expect(await context.tabs.get(1)).toBeNull();
  });
});
