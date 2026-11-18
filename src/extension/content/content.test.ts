import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onScreen, scrollable } from '../../../test/dom';
import { fakeGitLab, fakeWindow } from '../../../test/page';
import type { ReloadMarker } from '../../core/session';
import { TIMING } from '../../core/timing';
import { NOTHING_NEW, type CheckReply, type ToBackground } from '../messages';
import { startContentScript } from './content';

const ORIGIN = 'https://gitlab.example.com';
const MR_PAGE = '/g/p/-/merge_requests/1';

function setup(path = MR_PAGE, marker: ReloadMarker | null = null) {
  const gitlab = fakeGitLab({});
  const page = fakeWindow(`${ORIGIN}${path}`, gitlab);
  const state = {
    check: { ...NOTHING_NEW },
    held: null as Promise<void> | null,
  };
  const send = vi.fn(async (message: ToBackground): Promise<unknown> => {
    if (state.held) await state.held;
    if (message.type === 'hello') return { reload: marker };
    if (message.type === 'check') return state.check;
    return undefined;
  });
  const sent = (type: ToBackground['type']) =>
    send.mock.calls
      .filter(([message]) => message.type === type)
      .map(([m]) => m);
  const draft = (text: string) => {
    const field = page.doc.createElement('textarea');
    field.value = text;
    page.doc.body.append(onScreen(field));
    return field;
  };
  const banner = () =>
    page.doc.getElementById('gl-live-refresh')?.shadowRoot ?? null;
  return {
    page,
    send,
    sent,
    draft,
    banner,
    start: () => startContentScript(page.win, send, TIMING),
    answer(check: Partial<CheckReply>) {
      state.check = { ...NOTHING_NEW, ...check };
    },
    hold() {
      let release: () => void = () => undefined;
      state.held = new Promise((resolve) => {
        release = () => {
          state.held = null;
          resolve();
        };
      });
      return release;
    },
  };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const urgent = () => ({ changed: ['pipeline'], lastMoveAt: Date.now() });

beforeEach(() => {
  vi.useFakeTimers({ now: 10_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startContentScript', () => {
  it('introduces the page to the background', async () => {
    const { start, sent } = setup();
    await start();

    expect(sent('hello')).toEqual([
      {
        type: 'hello',
        page: expect.objectContaining({ type: 'mr', id: '1' }) as unknown,
        url: `${ORIGIN}${MR_PAGE}`,
        visible: true,
        busy: false,
      },
    ]);
  });

  it('asks what changed shortly after load, then every 15 s', async () => {
    const { start, sent } = setup();
    await start();

    await advance(1_500);
    expect(sent('check')).toEqual([{ type: 'check', arriving: false }]);
    await advance(15_000);
    expect(sent('check')).toHaveLength(2);
  });

  it('reloads on an urgent change once you are idle, telling the background first', async () => {
    const { start, answer, page, sent } = setup();
    await start();
    await advance(1_500);

    answer(urgent());
    await advance(15_000);
    expect(sent('reloading')).toEqual([
      { type: 'reloading', reason: 'changed: pipeline', manual: false },
    ]);
    expect(page.location.reload).toHaveBeenCalledOnce();
    expect(
      JSON.parse(page.session.getItem('gl-live-refresh:scroll') ?? 'null'),
    ).toEqual({
      url: `${ORIGIN}${MR_PAGE}`,
      selector: null,
      top: 0,
    });
  });

  it('reloads even when the background cannot be told', async () => {
    const { start, answer, page, send } = setup();
    await start();
    answer(urgent());
    send.mockImplementation((message) =>
      message.type === 'reloading'
        ? Promise.reject(new Error('gone'))
        : Promise.resolve({ ...NOTHING_NEW, ...urgent() }),
    );

    await advance(16_500);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('holds an edit until it settled, asking the background meanwhile', async () => {
    const { start, answer, page, sent } = setup();
    await start();
    answer({ changed: ['updatedAt'], lastMoveAt: Date.now() + 10_000 });

    await advance(16_500);
    await advance(15_000);
    expect(page.location.reload).not.toHaveBeenCalled();
    expect(sent('check')).toHaveLength(3);

    await advance(15_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('waits on your unsent text with the background answer in hand', async () => {
    const { start, answer, page, sent, draft, banner } = setup();
    const field = draft('half a comment');
    await start();
    answer(urgent());
    await advance(16_500);

    expect(banner()?.querySelector('.detail')?.textContent).toBe(
      'Reload waits: unsent text on the page.',
    );
    await advance(3_000);
    expect(sent('check')).toHaveLength(1);

    field.value = '';
    await advance(1_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('acknowledges the change when you dismiss the banner', async () => {
    const { start, answer, page, sent, draft, banner } = setup();
    const field = draft('draft');
    await start();
    answer(urgent());
    await advance(16_500);

    answer(NOTHING_NEW);
    banner()!.querySelector<HTMLElement>('.dismiss')!.click();
    field.value = '';
    await advance(20_000);

    expect(sent('acknowledge')).toHaveLength(1);
    expect(page.location.reload).not.toHaveBeenCalled();
  });

  it('reloads on the banner button as a reload you asked for', async () => {
    const { start, answer, sent, draft, banner } = setup();
    draft('draft');
    await start();
    answer(urgent());
    await advance(16_500);

    banner()!.querySelector<HTMLElement>('.now')!.click();
    expect(sent('reloading')).toEqual([
      { type: 'reloading', reason: 'banner button', manual: true },
    ]);
  });

  it('backs off while the background cannot read GitLab', async () => {
    const { start, answer, sent } = setup();
    await start();
    answer({ failed: true });

    await advance(1_500);
    expect(sent('check')).toHaveLength(1);
    await advance(15_000);
    expect(sent('check')).toHaveLength(1);
    await advance(15_000);
    expect(sent('check')).toHaveLength(2);
    await advance(15_000);
    expect(sent('check')).toHaveLength(2);
  });

  it('never runs two checks at once', async () => {
    const { start, sent, hold, page } = setup();
    await start();

    const release = hold();
    await advance(1_500);
    page.dispatch('focus');
    await advance(0);
    expect(sent('check')).toHaveLength(1);

    release();
    await advance(0);
    expect(sent('check')).toHaveLength(2);
  });
});

describe('startContentScript and the background tab', () => {
  it('stops asking while the tab is in the background, saying what is on it', async () => {
    const { start, page, sent, draft } = setup();
    draft('draft');
    await start();

    page.setHidden(true);
    page.doc.dispatchEvent(new Event('visibilitychange'));
    await advance(60_000);

    expect(sent('away')).toEqual([{ type: 'away', busy: true }]);
    expect(sent('check')).toHaveLength(0);
  });

  it('starts quiet when it loads in the background', async () => {
    const { start, page, sent } = setup();
    page.setHidden(true);
    await start();

    await advance(60_000);
    expect(sent('check')).toHaveLength(0);
  });

  it('asks for a fresh answer the moment you come back, and reloads at once', async () => {
    const { start, page, sent, answer } = setup();
    page.setHidden(true);
    await start();
    answer(urgent());

    page.dispatch('pointermove');
    page.setHidden(false);
    page.doc.dispatchEvent(new Event('visibilitychange'));
    page.dispatch('focus');
    await advance(0);

    expect(sent('check')).toEqual([{ type: 'check', arriving: true }]);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });
});

describe('startContentScript after a reload', () => {
  const marker = (manual: boolean): ReloadMarker => ({
    url: `${ORIGIN}${MR_PAGE}`,
    at: Date.now(),
    manual,
    reason: 'changed: pipeline',
  });

  it('puts you back where you were', async () => {
    const { page, start } = setup(MR_PAGE, marker(false));
    const panel = page.doc.createElement('div');
    panel.className = 'js-static-panel-inner';
    page.doc.body.append(panel);
    scrollable(panel, { scrollHeight: 5_000, clientHeight: 800 });
    page.session.setItem(
      'gl-live-refresh:scroll',
      JSON.stringify({
        url: `${ORIGIN}${MR_PAGE}`,
        selector: '.js-static-panel-inner',
        top: 900,
      }),
    );

    await start();
    expect(panel.scrollTop).toBe(900);
  });

  it('keeps the error-reload cap across its own reloads, re-arms it after yours', async () => {
    const auto = setup(MR_PAGE, marker(false));
    auto.page.session.setItem('gl-live-refresh:error-reloads', '{"count":3}');
    await auto.start();
    expect(
      auto.page.session.getItem('gl-live-refresh:error-reloads'),
    ).not.toBeNull();

    const manual = setup(MR_PAGE, marker(true));
    manual.page.session.setItem('gl-live-refresh:error-reloads', '{"count":3}');
    await manual.start();
    expect(
      manual.page.session.getItem('gl-live-refresh:error-reloads'),
    ).toBeNull();
  });
});

describe('startContentScript elsewhere on GitLab', () => {
  it('reloads a page showing "Something went wrong", without asking the background', async () => {
    const { page, start, sent } = setup('/dashboard/todos');
    const alert = page.doc.createElement('div');
    alert.className = 'gl-alert';
    alert.textContent = 'Something went wrong';
    page.doc.body.append(onScreen(alert));
    await start();

    await advance(9_000);
    expect(sent('reloading')).toEqual([
      { type: 'reloading', reason: 'error alert', manual: false },
    ]);
    expect(sent('check')).toHaveLength(0);
  });

  it('leaves an error alone once you dismiss its banner', async () => {
    const { page, start, sent, draft, banner } = setup('/dashboard/todos');
    const alert = page.doc.createElement('div');
    alert.className = 'gl-alert';
    alert.textContent = 'Something went wrong';
    page.doc.body.append(onScreen(alert));
    const field = draft('draft');
    await start();
    await advance(1_500);

    banner()!.querySelector<HTMLElement>('.dismiss')!.click();
    field.value = '';
    await advance(30_000);
    expect(sent('reloading')).toHaveLength(0);
    expect(sent('acknowledge')).toHaveLength(0);
  });

  it('introduces the new page when GitLab navigates in place', async () => {
    const { page, start, sent } = setup();
    await start();

    page.location.href = `${ORIGIN}${MR_PAGE}/diffs`;
    page.dispatch('popstate');
    expect(sent('hello')).toHaveLength(1);

    page.location.href = `${ORIGIN}/g/p/-/pipelines/5`;
    page.dispatch('popstate');
    await advance(0);
    expect(sent('hello')).toHaveLength(2);
    expect(sent('hello')[1]).toMatchObject({
      url: `${ORIGIN}/g/p/-/pipelines/5`,
    });
    await advance(1_500);
    expect(sent('check')).toHaveLength(1);
  });

  it('carries on when the new page cannot be introduced', async () => {
    const { page, start, send, sent } = setup();
    await start();
    send.mockRejectedValueOnce(new Error('gone'));

    page.location.href = `${ORIGIN}/g/p/-/pipelines/5`;
    page.dispatch('popstate');
    await advance(1_500);
    expect(sent('check')).toHaveLength(1);
  });

  it('traces what it does with the debug flag on', async () => {
    const { page, start, answer, draft } = setup();
    page.local.setItem('gl-live-refresh:debug', '1');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const field = draft('draft');
    await start();
    answer(urgent());
    await advance(1_500);
    field.value = '';
    await advance(8_000);

    const trace = JSON.parse(
      page.local.getItem('gl-live-refresh:trace') ?? '[]',
    ) as string[];
    expect(trace.map((entry) => entry.split(' ').slice(2).join(' '))).toEqual([
      `v load ${MR_PAGE}: opened`,
      'v reload waits: unsent text on the page',
      'v reload waits: you are active',
      'v reload: changed: pipeline',
    ]);
  });

  it('saves where you are as you scroll', async () => {
    const { page, start } = setup();
    await start();

    page.dispatch('scroll');
    await advance(250);
    expect(page.session.getItem('gl-live-refresh:scroll')).not.toBeNull();
  });
});
