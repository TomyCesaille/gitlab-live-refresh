import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onScreen, scrollable } from '../../test/dom';
import { fakeGitLab, fakeWindow } from '../../test/page';
import { TIMING } from '../core/timing';
import { startUserscript } from './watcher';

const ORIGIN = 'https://gitlab.example.com';
const MR = '/api/v4/projects/g%2Fp/merge_requests/1';
const MR_PAGE = '/g/p/-/merge_requests/1';

const mr = (changes: Record<string, unknown> = {}) => ({
  state: 'opened',
  sha: 'a1',
  user_notes_count: 1,
  detailed_merge_status: 'mergeable',
  updated_at: 't0',
  head_pipeline: { id: 1, status: 'running' },
  ...changes,
});

function setup(path = MR_PAGE) {
  const gitlab = fakeGitLab({
    [MR]: mr(),
    [`${MR}/approvals`]: { approvals_left: 1, approved_by: [] },
  });
  const page = fakeWindow(`${ORIGIN}${path}`, gitlab);
  const start = () => {
    startUserscript(page.win, TIMING);
  };
  const serverChanges = (changes: Record<string, unknown>) => {
    gitlab.answers.set(MR, mr(changes));
  };
  const marker = () =>
    JSON.parse(
      page.session.getItem('gl-live-refresh:auto-reload') ?? 'null',
    ) as {
      reason: string;
      manual: boolean;
    } | null;
  const banner = () =>
    page.doc.getElementById('gl-live-refresh')?.shadowRoot ?? null;
  const draft = (text: string) => {
    const field = page.doc.createElement('textarea');
    field.value = text;
    page.doc.body.append(onScreen(field));
    return field;
  };
  const trace = () =>
    JSON.parse(page.local.getItem('gl-live-refresh:trace') ?? '[]') as string[];
  return { gitlab, page, start, serverChanges, marker, banner, draft, trace };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startUserscript on a merge request', () => {
  it('reads the merge request shortly after load, then every 15 s', async () => {
    const { gitlab, start } = setup();
    start();

    await advance(1_500);
    expect(gitlab.fetch).toHaveBeenCalledTimes(2);
    await advance(15_000);
    expect(gitlab.fetch).toHaveBeenCalledTimes(4);
  });

  it('reloads once something urgent changes and you are idle', async () => {
    const { page, start, serverChanges, marker } = setup();
    start();
    await advance(1_500);

    serverChanges({ head_pipeline: { id: 1, status: 'success' } });
    await advance(15_000);

    expect(page.location.reload).toHaveBeenCalledOnce();
    expect(marker()).toMatchObject({
      reason: 'changed: pipeline',
      manual: false,
    });
  });

  it('holds an edit until the page sits still for 30 s', async () => {
    const { page, start, serverChanges } = setup();
    start();
    await advance(1_500);

    serverChanges({ updated_at: 't1' });
    await advance(15_000);
    await advance(15_000);
    expect(page.location.reload).not.toHaveBeenCalled();

    await advance(15_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('cuts an edit short when something urgent follows', async () => {
    const { page, start, serverChanges } = setup();
    start();
    await advance(1_500);

    serverChanges({ updated_at: 't1' });
    await advance(15_000);
    serverChanges({ updated_at: 't2', user_notes_count: 2 });
    await advance(15_000);

    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('waits on your unsent text, saying so, then reloads once it is gone', async () => {
    const { page, start, serverChanges, banner, draft } = setup();
    const field = draft('half a comment');
    start();
    await advance(1_500);

    serverChanges({ user_notes_count: 2 });
    await advance(15_000);
    expect(page.location.reload).not.toHaveBeenCalled();
    expect(banner()?.querySelector('.title')?.textContent).toBe(
      'GitLab changed: comments',
    );
    expect(banner()?.querySelector('.detail')?.textContent).toBe(
      'Reload waits: unsent text on the page.',
    );

    await advance(3_000);
    expect(page.location.reload).not.toHaveBeenCalled();

    field.value = '';
    await advance(1_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('forgets the change when you dismiss the banner', async () => {
    const { page, start, serverChanges, banner, draft } = setup();
    const field = draft('draft');
    start();
    await advance(1_500);
    serverChanges({ user_notes_count: 2 });
    await advance(15_000);

    banner()!.querySelector<HTMLElement>('.dismiss')!.click();
    field.value = '';
    await advance(30_000);

    expect(page.location.reload).not.toHaveBeenCalled();
  });

  it('reloads at once on the banner button, as a reload you asked for', async () => {
    const { page, start, serverChanges, banner, draft, marker } = setup();
    draft('draft');
    start();
    await advance(1_500);
    serverChanges({ user_notes_count: 2 });
    await advance(15_000);

    banner()!.querySelector<HTMLElement>('.now')!.click();

    expect(page.location.reload).toHaveBeenCalledOnce();
    expect(marker()).toMatchObject({ reason: 'banner button', manual: true });
  });

  it('polls a background tab once a minute and reloads it there', async () => {
    const { page, gitlab, start, serverChanges } = setup();
    page.setHidden(true);
    start();
    await advance(1_500);

    serverChanges({ state: 'merged' });
    await advance(15_000);
    expect(gitlab.fetch).toHaveBeenCalledTimes(2);

    await advance(45_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('reloads the moment you come back, even mid-gesture', async () => {
    const { page, gitlab, start, serverChanges } = setup();
    page.setHidden(true);
    start();
    await advance(1_500);
    serverChanges({ head_pipeline: { id: 1, status: 'failed' } });

    page.dispatch('pointermove');
    page.setHidden(false);
    page.doc.dispatchEvent(new Event('visibilitychange'));
    page.dispatch('focus');
    await advance(0);

    expect(gitlab.fetch).toHaveBeenCalledTimes(4);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('ignores the tab going to the background', async () => {
    const { page, gitlab, start } = setup();
    start();
    await advance(1_500);

    page.setHidden(true);
    page.doc.dispatchEvent(new Event('visibilitychange'));
    await advance(0);

    expect(gitlab.fetch).toHaveBeenCalledTimes(2);
  });

  it('runs the arrival check right after a poll that was in flight', async () => {
    const { page, gitlab, start, serverChanges } = setup();
    start();
    await advance(1_500);
    serverChanges({ user_notes_count: 5 });
    page.dispatch('keydown');

    const release = gitlab.hold();
    await advance(15_000);
    page.dispatch('focus');
    page.dispatch('keydown');
    release();
    await advance(0);

    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('never runs two checks at once', async () => {
    const { page, gitlab, start } = setup();
    gitlab.answers.set('/api/v4/projects/g%2Fp/jobs/7', { status: 'running' });
    start();
    await advance(1_500);

    const release = gitlab.hold();
    await advance(15_000);
    page.location.href = `${ORIGIN}/g/p/-/jobs/7`;
    page.dispatch('popstate');
    await advance(0);
    expect(gitlab.fetch).toHaveBeenCalledTimes(4);

    release();
    await advance(15_000);
    expect(gitlab.fetch).toHaveBeenLastCalledWith(
      `${ORIGIN}/api/v4/projects/g%2Fp/jobs/7`,
      expect.anything(),
    );
  });

  it('saves where you are as you scroll', async () => {
    const { page, start } = setup();
    start();

    page.dispatch('scroll');
    await advance(250);

    expect(
      JSON.parse(page.session.getItem('gl-live-refresh:scroll') ?? 'null'),
    ).toEqual({ url: `${ORIGIN}${MR_PAGE}`, selector: null, top: 0 });
  });

  it('backs off while GitLab fails', async () => {
    const { gitlab, start } = setup();
    start();
    await advance(1_500);

    gitlab.failNext(2);
    await advance(15_000);
    expect(gitlab.fetch).toHaveBeenCalledTimes(4);
    await advance(15_000);
    expect(gitlab.fetch).toHaveBeenCalledTimes(4);
    await advance(15_000);
    expect(gitlab.fetch).toHaveBeenCalledTimes(6);
  });
});

describe('startUserscript after a reload', () => {
  function reloaded(manual: boolean) {
    const context = setup();
    context.page.session.setItem(
      'gl-live-refresh:auto-reload',
      JSON.stringify({
        url: `${ORIGIN}${MR_PAGE}`,
        at: Date.now() - 1_000,
        manual,
        reason: 'changed: pipeline',
      }),
    );
    return context;
  }

  it('puts you back where you were', () => {
    const { page, start } = reloaded(false);
    const panel = page.doc.createElement('div');
    panel.className = 'js-static-panel-inner';
    page.doc.body.append(panel);
    scrollable(panel, { scrollHeight: 5_000, clientHeight: 800 });
    page.session.setItem(
      'gl-live-refresh:scroll',
      JSON.stringify({
        url: `${ORIGIN}${MR_PAGE}`,
        selector: '.js-static-panel-inner',
        top: 1_200,
      }),
    );

    start();
    expect(panel.scrollTop).toBe(1_200);
  });

  it('waits 45 s after an automatic reload before the next one', async () => {
    const { page, start, serverChanges } = reloaded(false);
    start();
    await advance(1_500);

    serverChanges({ user_notes_count: 9 });
    await advance(15_000);
    expect(page.location.reload).not.toHaveBeenCalled();
    await advance(15_000);
    expect(page.location.reload).not.toHaveBeenCalled();
    await advance(15_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('re-arms the error-reload cap after a reload you asked for', () => {
    const { page, start } = reloaded(true);
    page.session.setItem(
      'gl-live-refresh:error-reloads',
      JSON.stringify({ url: `${ORIGIN}${MR_PAGE}`, count: 3 }),
    );

    start();
    expect(page.session.getItem('gl-live-refresh:error-reloads')).toBeNull();
  });

  it('keeps the error-reload cap across its own reloads', () => {
    const { page, start } = reloaded(false);
    page.session.setItem('gl-live-refresh:error-reloads', '{"count":3}');

    start();
    expect(
      page.session.getItem('gl-live-refresh:error-reloads'),
    ).not.toBeNull();
  });
});

describe('startUserscript and "Something went wrong"', () => {
  function withAlert() {
    const context = setup('/dashboard/todos');
    const alert = context.page.doc.createElement('div');
    alert.className = 'gl-alert';
    alert.textContent = 'Something went wrong. Please try again.';
    context.page.doc.body.append(onScreen(alert));
    return context;
  }

  it('reloads a page showing the error, on any GitLab page', async () => {
    const { page, start, marker } = withAlert();
    start();
    await advance(1_500);
    expect(page.location.reload).not.toHaveBeenCalled();

    await advance(7_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
    expect(marker()?.reason).toBe('error alert');
  });

  it('rechecks every second while the reload waits on you', async () => {
    const { page, start, draft } = withAlert();
    const field = draft('draft');
    start();
    await advance(1_500);
    expect(page.location.reload).not.toHaveBeenCalled();

    field.value = '';
    await advance(7_000);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it('leaves the error alone once you dismiss its banner', async () => {
    const { page, start, draft, banner } = withAlert();
    const field = draft('draft');
    start();
    await advance(1_500);

    banner()!.querySelector<HTMLElement>('.dismiss')!.click();
    field.value = '';
    await advance(60_000);
    expect(page.location.reload).not.toHaveBeenCalled();
  });
});

describe('startUserscript on other pages', () => {
  it('reads nothing from GitLab off merge request, pipeline and job pages', async () => {
    const { gitlab, start } = setup('/dashboard/todos');
    start();
    await advance(60_000);

    expect(gitlab.fetch).not.toHaveBeenCalled();
  });

  it('follows navigation to another page at once', async () => {
    const { page, gitlab, start } = setup();
    gitlab.answers.set('/api/v4/projects/g%2Fp/jobs/7', {
      id: 7,
      status: 'running',
    });
    start();
    await advance(1_500);

    page.location.href = `${ORIGIN}/g/p/-/merge_requests/1/diffs`;
    page.dispatch('popstate');
    await advance(0);
    expect(gitlab.fetch).toHaveBeenCalledTimes(2);

    page.location.href = `${ORIGIN}/g/p/-/jobs/7`;
    page.dispatch('popstate');
    await advance(0);
    expect(gitlab.fetch).toHaveBeenLastCalledWith(
      `${ORIGIN}/api/v4/projects/g%2Fp/jobs/7`,
      expect.anything(),
    );
  });
});

describe('startUserscript trace', () => {
  it('records what it saw and did, with the debug flag on', async () => {
    const { page, start, serverChanges, trace, draft } = setup();
    page.local.setItem('gl-live-refresh:debug', '1');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const field = draft('draft');
    start();
    await advance(1_500);
    await advance(15_000);
    serverChanges({ user_notes_count: 2 });
    await advance(15_000);
    await advance(1_000);
    field.value = '';
    await advance(1_000);

    const entries = trace().map((entry) => entry.split(' ').slice(3).join(' '));
    expect(entries).toEqual([
      `load ${MR_PAGE}: opened`,
      expect.stringMatching(/^page /),
      expect.stringMatching(/^baseline /),
      'poll: same',
      'poll: pending comments, moved comments',
      'reload waits: unsent text on the page',
      'reload: changed: comments',
    ]);
  });

  it('records a failed poll', async () => {
    const { page, gitlab, start, trace } = setup();
    page.local.setItem('gl-live-refresh:debug', '1');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    start();
    await advance(1_500);
    gitlab.failNext();
    await advance(15_000);

    expect(trace().at(-1)).toMatch(
      /poll failed GitLabError: GitLab answered 502/,
    );
  });

  it('records a pending change that stopped moving', async () => {
    const { page, start, serverChanges, trace } = setup();
    page.local.setItem('gl-live-refresh:debug', '1');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    start();
    await advance(1_500);
    serverChanges({ updated_at: 't1' });
    await advance(30_000);

    expect(trace().at(-1)).toMatch(/poll: pending updatedAt$/);
  });
});
