import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen, render } from '../../../test/dom';
import { errorReloadsSpent, spendErrorReload } from '../session';
import { memoryStore } from '../storage';
import type { Banner } from './banner';
import type { Blocker } from './blockers';
import { createErrorWatch, findErrorAlert } from './error-watch';

const url = 'https://gitlab.example.com/g/p/-/merge_requests/1';

afterEach(() => {
  document.body.innerHTML = '';
});

function showAlert(text = 'Something went wrong. Please try again.') {
  render(`<div class="gl-alert">${text}</div>`);
  return onScreen(document.querySelector('.gl-alert')!);
}

function setup({
  blocker = null as Blocker | null,
  up = true,
  mode = null as Banner['mode'],
} = {}) {
  const session = memoryStore();
  const banner = { mode, show: vi.fn(), hide: vi.fn() };
  const reload = vi.fn();
  const watch = createErrorWatch({
    doc: document,
    session,
    url: () => url,
    banner,
    blocker: (arriving: boolean) => (arriving ? null : blocker),
    answers: () => Promise.resolve(up),
    reload,
    limit: 3,
  });
  return { watch, banner, reload, session };
}

describe('findErrorAlert', () => {
  it('finds a visible "Something went wrong" alert', () => {
    const alert = showAlert();
    expect(findErrorAlert(document)).toBe(alert);
  });

  it('ignores other alerts and hidden ones', () => {
    showAlert('This project is archived.');
    expect(findErrorAlert(document)).toBeNull();

    render('<div role="alert">Something went wrong</div>');
    expect(findErrorAlert(document)).toBeNull();
  });
});

describe('createErrorWatch', () => {
  it('stays out of the way while the page shows no error', async () => {
    const { watch, banner } = setup();

    await expect(watch.check(false)).resolves.toBe('clear');
    expect(banner.hide).not.toHaveBeenCalled();
  });

  it('takes its error banner down once the error is gone', async () => {
    const { watch, banner } = setup({ mode: 'errorOffline' });

    await expect(watch.check(false)).resolves.toBe('clear');
    expect(banner.hide).toHaveBeenCalled();
  });

  it('leaves an update banner up', async () => {
    const { watch, banner } = setup({ mode: 'updates' });

    await watch.check(false);
    expect(banner.hide).not.toHaveBeenCalled();
  });

  it('reloads the page and counts the reload', async () => {
    showAlert();
    const { watch, reload, session } = setup();

    await expect(watch.check(false)).resolves.toBe('owned');
    expect(reload).toHaveBeenCalledWith('error alert');
    expect(errorReloadsSpent(session, url)).toBe(1);
  });

  it('waits for you, saying why', async () => {
    showAlert();
    const { watch, banner, reload } = setup({ blocker: 'typing' });

    await expect(watch.check(false)).resolves.toBe('waiting');
    expect(banner.show).toHaveBeenCalledWith('error', {
      why: 'you are typing',
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads on arrival even while you would otherwise hold it', async () => {
    showAlert();
    const { watch, reload } = setup({ blocker: 'active' });

    await expect(watch.check(true)).resolves.toBe('owned');
    expect(reload).toHaveBeenCalledWith('error alert');
  });

  it('waits for GitLab to answer before reloading', async () => {
    showAlert();
    const { watch, banner, reload } = setup({ up: false });

    await expect(watch.check(false)).resolves.toBe('owned');
    expect(banner.show).toHaveBeenCalledWith('errorOffline');
    expect(reload).not.toHaveBeenCalled();
  });

  it('stops after 3 automatic reloads of the page', async () => {
    showAlert();
    const { watch, banner, reload, session } = setup();
    for (let i = 0; i < 3; i += 1) spendErrorReload(session, url);

    await expect(watch.check(false)).resolves.toBe('owned');
    expect(banner.show).toHaveBeenCalledWith('errorStuck');
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores an alert you dismissed, until GitLab shows a new one', async () => {
    showAlert();
    const { watch, reload } = setup();

    watch.dismiss();
    await expect(watch.check(false)).resolves.toBe('clear');

    showAlert();
    await expect(watch.check(false)).resolves.toBe('owned');
    expect(reload).toHaveBeenCalledOnce();
  });
});
