import { describeChanges } from '../core/changes';
import { createBanner } from '../core/dom/banner';
import {
  BLOCKER_TEXT,
  reloadBlocker,
  trackActivity,
  type Blocker,
} from '../core/dom/blockers';
import { createErrorWatch } from '../core/dom/error-watch';
import {
  captureScroll,
  persistScroll,
  restoreScroll,
  savedScroll,
  saveScroll,
} from '../core/dom/scroll';
import { fetchFingerprint } from '../core/fingerprint';
import { createGitLabClient } from '../core/gitlab';
import { detectPage, type PageRef } from '../core/page';
import { isReloadDue, nextPollDelay } from '../core/policy';
import {
  markReload,
  rearmErrorReloads,
  takeReloadMarker,
} from '../core/session';
import { webStore } from '../core/storage';
import { TIMING, type Timing } from '../core/timing';
import { createLog } from '../core/trace';
import { acknowledge, emptyTracker, observe } from '../core/tracker';

const FIRST_CHECK_MS = 1_500;

// The userscript runs everything inside the page: polling, decisions and
// reloads. Chrome freezes background tabs, so a background tab catches up when
// you come back to it.
export function startUserscript(win: Window, timing: Timing = TIMING): void {
  const doc = win.document;
  const session = webStore(() => win.sessionStorage);
  const local = webStore(() => win.localStorage);
  const log = createLog({ local, session, hidden: () => doc.hidden });
  const client = createGitLabClient({
    origin: win.location.origin,
    fetch: (input, init) => win.fetch(input, init),
    timeoutMs: timing.requestTimeoutMs,
  });
  const lastInputAt = trackActivity(win);

  let page: PageRef | null = null;
  let tracker = emptyTracker();
  let failures = 0;
  let lastWhy: Blocker | null = null;
  let waitingOnUser = false;
  let arrivedAt = 0;
  let arrivalPending = false;
  let running = false;
  let reloading = false; // the page is on its way out: schedule nothing more
  let timer: ReturnType<typeof setTimeout> | undefined;

  function reload(reason: string, manual = false): void {
    log('reload:', reason);
    reloading = true;
    const url = win.location.href;
    saveScroll(session, captureScroll(doc, url));
    markReload(session, { url, at: Date.now(), manual, reason });
    win.location.reload();
  }

  const blocker = (arriving: boolean) =>
    reloadBlocker(doc, {
      lastInputAt: lastInputAt(),
      now: Date.now(),
      idleMs: timing.idleMs,
      arriving,
    });

  const banner = createBanner(
    doc,
    {
      onReload: () => {
        reload('banner button', true);
      },
      onDismiss: (mode) => {
        if (mode?.startsWith('error')) errors.dismiss();
        else tracker = acknowledge(tracker);
      },
    },
    timing.errorReloadLimit,
  );

  const errors = createErrorWatch({
    doc,
    session,
    url: () => win.location.href,
    banner,
    blocker,
    answers: () => client.answers(),
    reload,
    limit: timing.errorReloadLimit,
  });

  function syncPage(): void {
    const next = detectPage(win.location);
    if (next?.key === page?.key) return;
    page = next;
    tracker = emptyTracker();
    failures = 0;
    lastWhy = null;
    banner.hide();
    log('page', next);
  }

  async function poll(current: PageRef): Promise<void> {
    try {
      const fingerprint = await fetchFingerprint(client, current);
      failures = 0;
      const first = tracker.snapshot === null;
      tracker = observe(tracker, fingerprint, Date.now());
      if (first) {
        log('baseline', fingerprint);
        return;
      }
      const pending = tracker.changed.length
        ? `pending ${tracker.changed.join(',')}`
        : 'same';
      const moved = tracker.moved.length
        ? `, moved ${tracker.moved.join(',')}`
        : '';
      log(`poll: ${pending}${moved}`);
    } catch (error) {
      failures += 1;
      log('poll failed', String(error));
    }
  }

  const due = (arriving: boolean, lastAutoReloadAt: number) =>
    isReloadDue(
      tracker.changed,
      {
        now: Date.now(),
        lastMoveAt: tracker.lastMoveAt,
        lastAutoReloadAt,
        hidden: doc.hidden,
        arriving,
      },
      timing,
    );

  async function checkForUpdates(current: PageRef, arriving: boolean) {
    // Polling goes on while only edits are pending, so a burst of edits settles
    // and an urgent change cuts in.
    if (!due(arriving, lastAutoReloadAt)) await poll(current);
    if (!due(arriving, lastAutoReloadAt)) return;
    const why = blocker(arriving);
    if (!why) {
      reload(`changed: ${tracker.changed.join(', ')}`);
      return;
    }
    waitingOnUser = true;
    if (why !== lastWhy) log('reload waits:', BLOCKER_TEXT[why]);
    lastWhy = why;
    banner.show('updates', {
      changes: describeChanges(tracker.changed),
      why: BLOCKER_TEXT[why],
    });
  }

  function schedule(ms: number): void {
    clearTimeout(timer);
    if (reloading) return;
    timer = setTimeout(() => void tick(), ms);
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    const arriving = arrivalPending;
    arrivalPending = false;
    try {
      syncPage();
      waitingOnUser = false;
      const errorState = await errors.check(arriving);
      if (errorState === 'waiting') waitingOnUser = true;
      if (errorState === 'clear' && page) await checkForUpdates(page, arriving);
    } finally {
      running = false;
      schedule(nextDelay());
    }
  }

  function nextDelay(): number {
    if (arrivalPending) return 0;
    if (waitingOnUser) return timing.recheckMs;
    return nextPollDelay(doc.hidden, failures, timing);
  }

  const url = win.location.href;
  const marker = takeReloadMarker(
    session,
    url,
    Date.now(),
    timing.reloadMarkerMs,
  );
  const lastAutoReloadAt = marker && !marker.manual ? marker.at : 0;
  if (!marker || marker.manual) rearmErrorReloads(session);
  const position = marker && savedScroll(session, url);
  if (position) {
    restoreScroll(doc, position, {
      lastInputAt,
      timeoutMs: timing.scrollRestoreMs,
      log,
    });
  }
  persistScroll(win, session, () => win.location.href);
  log(
    `load ${win.location.pathname}: ${marker ? `after reload (${marker.reason})` : 'opened'}`,
  );

  const onArrive = () => {
    if (doc.hidden || Date.now() - arrivedAt < timing.arrivalDedupeMs) return;
    arrivedAt = Date.now();
    arrivalPending = true;
    log('arrive');
    schedule(0);
  };
  doc.addEventListener('visibilitychange', onArrive);
  win.addEventListener('focus', onArrive);
  win.addEventListener('popstate', () => {
    if (detectPage(win.location)?.key !== page?.key) schedule(0);
  });

  schedule(FIRST_CHECK_MS);
}
