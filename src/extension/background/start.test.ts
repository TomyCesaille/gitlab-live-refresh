import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeExtensionBrowser } from '../../../test/extension';
import { fakeGitLab } from '../../../test/page';
import { CONTENT_SCRIPT_ID } from './sites';
import { CONTENT_SCRIPT_FILE, startBackground, SWEEP_ALARM } from './start';

const ORIGIN = 'https://gitlab.example.com';
const SITE = `${ORIGIN}/*`;

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  const { fake, browser } = fakeExtensionBrowser([SITE]);
  const gitlab = fakeGitLab({
    '/api/v4/projects/g%2Fp/jobs/3': { id: 3, status: 'running' },
  });
  vi.stubGlobal('fetch', gitlab.fetch);
  startBackground(browser);
  const message = (body: unknown, sender: unknown) =>
    new Promise((resolve) => {
      const kept = fake.runtime.onMessage.fire(body, sender, resolve)[0];
      if (kept === false) resolve('not handled');
    });
  return { fake, gitlab, message };
}

const fromTab = { tab: { id: 4 }, url: `${ORIGIN}/g/p/-/jobs/3` };
const hello = {
  type: 'hello',
  page: {
    type: 'job',
    project: 'g/p',
    id: '3',
    filters: null,
    key: 'job:g/p:3:',
  },
  url: `${ORIGIN}/g/p/-/jobs/3`,
  visible: false,
  busy: false,
};

describe('startBackground', () => {
  it('sets up the sweep and the sites on install and at browser start', async () => {
    const { fake } = setup();

    for (const event of [fake.runtime.onInstalled, fake.runtime.onStartup]) {
      event.fire();
      await vi.waitFor(() => {
        expect(fake.scripting.registerContentScripts).toHaveBeenCalled();
      });
      expect(fake.alarms.create).toHaveBeenLastCalledWith(SWEEP_ALARM, {
        periodInMinutes: 1,
      });
      expect(fake.scripting.registerContentScripts).toHaveBeenLastCalledWith([
        expect.objectContaining({
          id: CONTENT_SCRIPT_ID,
          matches: [SITE],
          js: [CONTENT_SCRIPT_FILE],
        }),
      ]);
      fake.scripting.registerContentScripts.mockClear();
    }
  });

  it('follows the sites you turn on and off', async () => {
    const { fake } = setup();

    fake.permissions.onAdded.fire({ origins: [SITE] });
    fake.permissions.onRemoved.fire({ origins: [SITE] });
    await vi.waitFor(() => {
      expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
    });
  });

  it('changes the sites one at a time', async () => {
    const { fake } = setup();
    let finishFirst = () => undefined as unknown;
    fake.scripting.registerContentScripts.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );

    fake.permissions.onAdded.fire({});
    fake.permissions.onRemoved.fire({});
    await vi.waitFor(() => {
      expect(fake.scripting.registerContentScripts).toHaveBeenCalledOnce();
    });
    expect(fake.scripting.getRegisteredContentScripts).toHaveBeenCalledOnce();

    finishFirst();
    await vi.waitFor(() => {
      expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps following the sites after a change fails', async () => {
    const { fake } = setup();
    fake.scripting.registerContentScripts.mockRejectedValueOnce(
      new Error('registration'),
    );

    fake.permissions.onRemoved.fire({});
    fake.permissions.onRemoved.fire({});
    await vi.waitFor(() => {
      expect(fake.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
    });
  });

  it('starts live refresh in the open tabs of a site you turn on', async () => {
    const { fake } = setup();
    fake.tabs.query.mockResolvedValueOnce([{ id: 4 }, {}, { id: 5 }]);
    fake.scripting.executeScript.mockRejectedValueOnce(new Error('discarded'));

    fake.permissions.onAdded.fire({ origins: [SITE] });
    await vi.waitFor(() => {
      expect(fake.scripting.executeScript).toHaveBeenCalledTimes(2);
    });
    expect(fake.tabs.query).toHaveBeenCalledWith({ url: [SITE] });
    expect(fake.scripting.executeScript).toHaveBeenLastCalledWith({
      target: { tabId: 5 },
      files: [CONTENT_SCRIPT_FILE],
    });
  });

  it('starts nothing for a grant without a site', async () => {
    const { fake } = setup();

    fake.permissions.onAdded.fire({});
    await vi.waitFor(() => {
      expect(fake.scripting.registerContentScripts).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(fake.tabs.query).not.toHaveBeenCalled();
  });

  it('answers a page with the reply of the background', async () => {
    const { message, gitlab } = setup();

    await expect(message(hello, fromTab)).resolves.toEqual({ reload: null });
    expect(gitlab.fetch).toHaveBeenCalledWith(
      `${ORIGIN}/api/v4/projects/g%2Fp/jobs/3`,
      expect.anything(),
    );
  });

  it('answers null when it fails to handle a message', async () => {
    const { message, fake } = setup();
    vi.spyOn(fake.storage.session, 'get').mockRejectedValueOnce(
      new Error('storage'),
    );

    await expect(message(hello, fromTab)).resolves.toBeNull();
  });

  it('leaves messages from outside a tab alone', async () => {
    const { message } = setup();

    await expect(message(hello, {})).resolves.toBe('not handled');
    await expect(message(hello, { tab: { id: 4 } })).resolves.toBe(
      'not handled',
    );
  });

  it('reloads a background tab on the sweep alarm', async () => {
    vi.useFakeTimers({ now: 10_000_000 });
    const { message, fake, gitlab } = setup();
    await message(hello, fromTab);
    gitlab.answers.set('/api/v4/projects/g%2Fp/jobs/3', { status: 'failed' });
    vi.setSystemTime(10_060_000);

    fake.alarms.onAlarm.fire({ name: 'other' });
    fake.alarms.onAlarm.fire({ name: SWEEP_ALARM });
    await vi.waitFor(() => {
      expect(fake.tabs.reload).toHaveBeenCalledWith(4);
    });
    expect(fake.tabs.reload).toHaveBeenCalledOnce();
  });

  it('forgets a closed tab', async () => {
    const { message, fake } = setup();
    await message(hello, fromTab);

    fake.tabs.onRemoved.fire(4);
    await vi.waitFor(() => {
      expect(fake.storage.session.data.size).toBe(0);
    });
  });
});
