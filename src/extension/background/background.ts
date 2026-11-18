import type { PageRef } from '../../core/page';
import { isReloadDue } from '../../core/policy';
import type { Timing } from '../../core/timing';
import type { Log } from '../../core/trace';
import { acknowledge, emptyTracker, observe } from '../../core/tracker';
import {
  NOTHING_NEW,
  type CheckReply,
  type HelloReply,
  type ToBackground,
} from '../messages';
import type { FingerprintSource } from './source';
import type { TabState, TabStore } from './tabs';

// A visible tab that stopped checking in is frozen or gone: the background
// treats it as a background tab.
const SILENT_AFTER_POLLS = 3;
// A read this fresh serves every tab on the same page.
const SHARED_READ_MS = 10_000;
// Alarms fire a little early or late.
const SWEEP_SLACK_MS = 5_000;

export interface BackgroundOptions {
  tabs: TabStore;
  source: FingerprintSource;
  reloadTab: (tabId: number) => Promise<void>;
  timing: Timing;
  log: Log;
}

type Hello = Extract<ToBackground, { type: 'hello' }>;

export function createBackground(options: BackgroundOptions) {
  const { tabs, source, timing, log } = options;
  const queues = new Map<number, Promise<unknown>>();

  // Messages from a tab and the sweep both rewrite that tab's state: one at a
  // time per tab.
  function serialized<T>(tabId: number, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(tabId) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = () => {
      if (queues.get(tabId) === next) queues.delete(tabId);
    };
    queues.set(tabId, next);
    next.then(settled, settled);
    return next;
  }

  async function poll(
    state: TabState,
    page: PageRef,
    maxAgeMs: number,
  ): Promise<{ state: TabState; failed: boolean }> {
    try {
      const fingerprint = await source.get(state.origin, page, maxAgeMs);
      const now = Date.now();
      const tracker = observe(state.tracker, fingerprint, now);
      return { state: { ...state, tracker, lastPollAt: now }, failed: false };
    } catch (error) {
      log('poll failed', String(error));
      return { state: { ...state, lastPollAt: Date.now() }, failed: true };
    }
  }

  async function update(
    tabId: number,
    change: (state: TabState) => TabState,
  ): Promise<void> {
    const state = await tabs.get(tabId);
    if (state) await tabs.set(tabId, change(state));
  }

  async function hello(
    tabId: number,
    origin: string,
    message: Hello,
  ): Promise<HelloReply> {
    const now = Date.now();
    const marker = (await tabs.get(tabId))?.reload ?? null;
    const reload =
      marker?.url === message.url && now - marker.at < timing.reloadMarkerMs
        ? marker
        : null;
    let state: TabState = {
      origin,
      url: message.url,
      page: message.page,
      visible: message.visible,
      busy: message.busy,
      tracker: emptyTracker(),
      lastSeenAt: now,
      lastPollAt: 0,
      lastAutoReloadAt: reload && !reload.manual ? reload.at : 0,
      reload: null,
    };
    if (message.page) state = (await poll(state, message.page, 0)).state;
    await tabs.set(tabId, state);
    log('hello', tabId, message.url, reload?.reason ?? 'opened');
    return { reload };
  }

  async function check(tabId: number, arriving: boolean): Promise<CheckReply> {
    const state = await tabs.get(tabId);
    if (!state?.page) return NOTHING_NEW;
    const seen = { ...state, visible: true, lastSeenAt: Date.now() };
    const result = await poll(seen, state.page, arriving ? 0 : SHARED_READ_MS);
    await tabs.set(tabId, result.state);
    return {
      changed: result.state.tracker.changed,
      lastMoveAt: result.state.tracker.lastMoveAt,
      lastAutoReloadAt: result.state.lastAutoReloadAt,
      failed: result.failed,
    };
  }

  function handle(
    tabId: number,
    origin: string,
    message: ToBackground,
  ): Promise<unknown> {
    return serialized<unknown>(tabId, () => {
      switch (message.type) {
        case 'hello':
          return hello(tabId, origin, message);
        case 'check':
          return check(tabId, message.arriving);
        case 'away':
          return update(tabId, (state) => ({
            ...state,
            visible: false,
            busy: message.busy,
            lastSeenAt: Date.now(),
          }));
        case 'acknowledge':
          return update(tabId, (state) => ({
            ...state,
            tracker: acknowledge(state.tracker),
          }));
        case 'reloading':
          return update(tabId, (state) => ({
            ...state,
            reload: {
              url: state.url,
              at: Date.now(),
              manual: message.manual,
              reason: message.reason,
            },
            lastAutoReloadAt: message.manual
              ? state.lastAutoReloadAt
              : Date.now(),
          }));
      }
    });
  }

  const isAway = (state: TabState, now: number) =>
    !state.visible ||
    now - state.lastSeenAt > SILENT_AFTER_POLLS * timing.pollMs;

  // Background tabs, frozen ones included, are read and reloaded from here:
  // nothing inside a frozen page runs until you come back to it.
  async function sweepTab(tabId: number): Promise<void> {
    const state = await tabs.get(tabId);
    const now = Date.now();
    if (!state?.page || !isAway(state, now)) return;
    if (now - state.lastPollAt < timing.hiddenPollMs - SWEEP_SLACK_MS) return;

    const result = await poll(state, state.page, SHARED_READ_MS);
    const { tracker, lastAutoReloadAt, busy, url } = result.state;
    const due =
      !busy &&
      isReloadDue(
        tracker.changed,
        {
          now,
          lastMoveAt: tracker.lastMoveAt,
          lastAutoReloadAt,
          hidden: true,
          arriving: false,
        },
        timing,
      );
    if (!due) {
      await tabs.set(tabId, result.state);
      return;
    }
    const reason = `changed: ${tracker.changed.join(', ')}`;
    await tabs.set(tabId, {
      ...result.state,
      reload: { url, at: now, manual: false, reason },
      lastAutoReloadAt: now,
    });
    log('reload in the background', tabId, reason);
    try {
      await options.reloadTab(tabId);
    } catch {
      await tabs.remove(tabId);
    }
  }

  async function sweep(): Promise<void> {
    const all = await tabs.all();
    await Promise.all(
      all.map(([tabId]) => serialized(tabId, () => sweepTab(tabId))),
    );
  }

  return {
    handle,
    sweep,
    forget: (tabId: number) => serialized(tabId, () => tabs.remove(tabId)),
  };
}

export type Background = ReturnType<typeof createBackground>;
