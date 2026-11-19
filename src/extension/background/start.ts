import type { browser as wxtBrowser } from 'wxt/browser';
import { TIMING, type Timing } from '../../core/timing';
import type { ToBackground } from '../messages';
import { createBackground } from './background';
import { syncContentScripts } from './sites';
import { fingerprintSource } from './source';
import { tabStore } from './tabs';

export type Browser = typeof wxtBrowser;

export const SWEEP_ALARM = 'sweep';
export const CONTENT_SCRIPT_FILE = '/content-scripts/content.js';

interface Sender {
  tab?: { id?: number };
  url?: string;
}

export function startBackground(browser: Browser, timing: Timing = TIMING) {
  const log = (...parts: unknown[]) => {
    console.debug('[gl-live-refresh]', ...parts);
  };
  const tabs = tabStore(browser.storage.session);
  const background = createBackground({
    tabs,
    source: fingerprintSource(
      (input, init) => fetch(input, init),
      timing.requestTimeoutMs,
    ),
    reloadTab: (tabId) => browser.tabs.reload(tabId),
    timing,
    log,
  });
  // One sync at a time: two in a row would register the same script twice.
  let syncing: Promise<unknown> = Promise.resolve();
  const sync = () => {
    const run = () => syncContentScripts(browser, CONTENT_SCRIPT_FILE);
    syncing = syncing.then(run, run);
    return syncing;
  };
  // A site you just turned on runs live refresh in its open tabs at once, with
  // no reload, whether or not the popup is still open to see the grant.
  const startInOpenTabs = async (origins: string[]) => {
    if (origins.length === 0) return;
    const open = await browser.tabs.query({ url: origins });
    const ids = open.map((tab) => tab.id).filter((id) => id !== undefined);
    // A tab that refuses the script (discarded, an error page) keeps the rest.
    await Promise.allSettled(
      ids.map((tabId) =>
        browser.scripting.executeScript({
          target: { tabId },
          files: [CONTENT_SCRIPT_FILE],
        }),
      ),
    );
  };
  const setUp = () =>
    Promise.all([
      sync(),
      browser.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 }),
    ]);

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: Sender,
      sendResponse: (reply: unknown) => void,
    ) => {
      const reply = (work: Promise<unknown>) => {
        work.then(sendResponse, () => {
          sendResponse(null);
        });
        return true;
      };
      const tabId = sender.tab?.id;
      if (tabId === undefined || !sender.url) return false;
      return reply(
        background.handle(
          tabId,
          new URL(sender.url).origin,
          message as ToBackground,
        ),
      );
    },
  );
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SWEEP_ALARM) void background.sweep();
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void background.forget(tabId);
  });
  browser.runtime.onInstalled.addListener(() => {
    void setUp();
  });
  browser.runtime.onStartup.addListener(() => {
    void setUp();
  });
  browser.permissions.onAdded.addListener(({ origins = [] }) => {
    void sync().then(() => startInOpenTabs(origins));
  });
  browser.permissions.onRemoved.addListener(() => {
    void sync();
  });
  return background;
}
