import { describeChanges } from '../../core/changes';
import { createBanner } from '../../core/dom/banner';
import {
  BLOCKER_TEXT,
  isBusy,
  reloadBlocker,
  trackActivity,
  type Blocker,
} from '../../core/dom/blockers';
import { createErrorWatch } from '../../core/dom/error-watch';
import {
  captureScroll,
  persistScroll,
  restoreScroll,
  savedScroll,
  saveScroll,
} from '../../core/dom/scroll';
import { createGitLabClient } from '../../core/gitlab';
import { detectPage, type PageRef } from '../../core/page';
import { isReloadDue, nextPollDelay } from '../../core/policy';
import { rearmErrorReloads } from '../../core/session';
import { webStore } from '../../core/storage';
import { TIMING, type Timing } from '../../core/timing';
import { createLog } from '../../core/trace';
import type { CheckReply, HelloReply, ToBackground } from '../messages';

export type Send = (message: ToBackground) => Promise<unknown>;

const FIRST_CHECK_MS = 1_500;

// The visible tab's side of the extension: it decides when you can take a
// reload, and asks the background what changed. Background tabs are the
// background's job, frozen or not.
export async function startContentScript(
  win: Window,
  send: Send,
  timing: Timing = TIMING,
): Promise<void> {
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

  let page: PageRef | null = detectPage(win.location);
  let reply: CheckReply | null = null;
  let failures = 0;
  let lastWhy: Blocker | null = null;
  let waitingOnUser = false;
  let arrivedAt = 0;
  let arrivalPending = false;
  let running = false;
  let reloading = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function reload(reason: string, manual = false): void {
    log('reload:', reason);
    reloading = true;
    clearTimeout(timer);
    saveScroll(session, captureScroll(doc, win.location.href));
    const go = () => {
      win.location.reload();
    };
    send({ type: 'reloading', reason, manual }).then(go, go);
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
        if (mode?.startsWith('error')) {
          errors.dismiss();
          return;
        }
        reply = null;
        void send({ type: 'acknowledge' });
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

  const due = (current: CheckReply, arriving: boolean) =>
    isReloadDue(
      current.changed,
      {
        now: Date.now(),
        lastMoveAt: current.lastMoveAt,
        lastAutoReloadAt: current.lastAutoReloadAt,
        hidden: false,
        arriving,
      },
      timing,
    );

  async function ask(arriving: boolean): Promise<CheckReply> {
    const answer = (await send({ type: 'check', arriving })) as CheckReply;
    failures = answer.failed ? failures + 1 : 0;
    const pending = answer.changed.length
      ? `pending ${answer.changed.join(',')}`
      : 'same';
    log(`check: ${answer.failed ? 'failed' : pending}`);
    return answer;
  }

  async function checkForUpdates(arriving: boolean): Promise<void> {
    // While a reload waits on you, the last answer stands: the rechecks every
    // second stay local.
    if (!reply || !due(reply, arriving)) reply = await ask(arriving);
    if (!due(reply, arriving)) return;
    const why = blocker(arriving);
    if (!why) {
      reload(`changed: ${reply.changed.join(', ')}`);
      return;
    }
    waitingOnUser = true;
    if (why !== lastWhy) log('reload waits:', BLOCKER_TEXT[why]);
    lastWhy = why;
    banner.show('updates', {
      changes: describeChanges(reply.changed),
      why: BLOCKER_TEXT[why],
    });
  }

  function schedule(ms: number): void {
    clearTimeout(timer);
    if (reloading || doc.hidden) return;
    timer = setTimeout(() => void tick(), ms);
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    const arriving = arrivalPending;
    arrivalPending = false;
    try {
      waitingOnUser = false;
      const errorState = await errors.check(arriving);
      if (errorState === 'waiting') waitingOnUser = true;
      if (errorState === 'clear' && page) await checkForUpdates(arriving);
    } finally {
      running = false;
      schedule(nextDelay());
    }
  }

  function nextDelay(): number {
    if (arrivalPending) return 0;
    if (waitingOnUser) return timing.recheckMs;
    return nextPollDelay(false, failures, timing);
  }

  async function hello(): Promise<HelloReply> {
    reply = null;
    return (await send({
      type: 'hello',
      page,
      url: win.location.href,
      visible: !doc.hidden,
      busy: isBusy(doc),
    })) as HelloReply;
  }

  const { reload: marker } = await hello();
  if (!marker || marker.manual) rearmErrorReloads(session);
  const position = marker && savedScroll(session, win.location.href);
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

  const arrive = () => {
    if (doc.hidden || Date.now() - arrivedAt < timing.arrivalDedupeMs) return;
    arrivedAt = Date.now();
    arrivalPending = true;
    log('arrive');
    schedule(0);
  };
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) {
      arrive();
      return;
    }
    clearTimeout(timer);
    void send({ type: 'away', busy: isBusy(doc) });
  });
  win.addEventListener('focus', arrive);
  win.addEventListener('popstate', () => {
    const next = detectPage(win.location);
    if (next?.key === page?.key) return;
    page = next;
    lastWhy = null;
    banner.hide();
    const resume = () => {
      schedule(FIRST_CHECK_MS);
    };
    hello().then(resume, resume);
  });

  schedule(FIRST_CHECK_MS);
}
