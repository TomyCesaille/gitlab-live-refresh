import type { KeyValueStore } from '../storage';
import type { Log } from '../trace';

// GitLab scrolls inside a panel, which the browser does not restore on reload.
export const PANEL_SCROLLER = '.js-static-panel-inner';

export interface ScrollPosition {
  url: string;
  selector: string | null; // null: the document itself
  top: number;
}

const SAVED = 'gl-live-refresh:scroll';
const SAVE_DELAY_MS = 250;
const RETRY_MS = 100;

export function captureScroll(doc: Document, url: string): ScrollPosition {
  const panel = doc.querySelector(PANEL_SCROLLER);
  if (panel && panel.scrollHeight > panel.clientHeight) {
    return { url, selector: PANEL_SCROLLER, top: panel.scrollTop };
  }
  return { url, selector: null, top: doc.documentElement.scrollTop };
}

export function savedScroll(
  store: KeyValueStore,
  url: string,
): ScrollPosition | null {
  const position = store.get(SAVED) as ScrollPosition | null;
  return position?.url === url ? position : null;
}

export function saveScroll(store: KeyValueStore, position: ScrollPosition) {
  store.set(SAVED, position);
}

// The page saves where you are as you scroll, so a reload it did not see coming
// (a background tab reloaded by the extension) still lands where you left it.
export function persistScroll(
  win: Window,
  store: KeyValueStore,
  url: () => string,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  win.addEventListener(
    'scroll',
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        saveScroll(store, captureScroll(win.document, url()));
      }, SAVE_DELAY_MS);
    },
    { passive: true, capture: true },
  );
}

export interface RestoreOptions {
  lastInputAt: () => number;
  timeoutMs: number;
  log: Log;
}

export function restoreScroll(
  doc: Document,
  position: ScrollPosition,
  { lastInputAt, timeoutMs, log }: RestoreOptions,
): void {
  if (position.top === 0) return;
  const deadline = Date.now() + timeoutMs;
  const inputAtStart = lastInputAt();

  const attempt = () => {
    if (lastInputAt() !== inputAtStart) {
      log('scroll restore dropped: input came first');
      return;
    }
    const element = position.selector
      ? doc.querySelector(position.selector)
      : doc.documentElement;
    const timedOut = Date.now() >= deadline;
    const reachable =
      element !== null &&
      element.scrollHeight - element.clientHeight >= position.top;
    if (element && (reachable || timedOut)) {
      element.scrollTop = position.top;
      log('scroll restored to', element.scrollTop, 'of', position.top);
    } else if (!timedOut) {
      setTimeout(attempt, RETRY_MS);
    }
  };
  attempt();
}
