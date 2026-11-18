import { errorReloadsSpent, spendErrorReload } from '../session';
import type { KeyValueStore } from '../storage';
import type { Banner } from './banner';
import { BLOCKER_TEXT, isVisible, type Blocker } from './blockers';

const ERROR_TEXT = /something went wrong/i;
const ALERTS = '.gl-alert, .flash-alert, [role="alert"]';

export function findErrorAlert(doc: Document): Element | null {
  return (
    [...doc.querySelectorAll(ALERTS)].find(
      (alert) => ERROR_TEXT.test(alert.textContent) && isVisible(alert),
    ) ?? null
  );
}

// clear: no error, the update check goes on. waiting: a reload waits on you.
// owned: the error owns the page this round.
export type ErrorCheck = 'clear' | 'waiting' | 'owned';

export interface ErrorWatchOptions {
  doc: Document;
  session: KeyValueStore;
  url: () => string;
  banner: Banner;
  blocker: () => Blocker | null;
  answers: () => Promise<boolean>;
  reload: (reason: string) => void;
  limit: number;
}

export interface ErrorWatch {
  check(): Promise<ErrorCheck>;
  dismiss(): void;
}

// "Something went wrong" alerts reload the page, at most `limit` times per page
// until you reload it yourself.
export function createErrorWatch(options: ErrorWatchOptions): ErrorWatch {
  let dismissed: Element | null = null;

  return {
    async check() {
      const alert = findErrorAlert(options.doc);
      if (!alert || alert === dismissed) {
        if (options.banner.mode?.startsWith('error')) options.banner.hide();
        return 'clear';
      }
      const url = options.url();
      if (errorReloadsSpent(options.session, url) >= options.limit) {
        options.banner.show('errorStuck');
        return 'owned';
      }
      const why = options.blocker();
      if (why) {
        options.banner.show('error', { why: BLOCKER_TEXT[why] });
        return 'waiting';
      }
      if (!(await options.answers())) {
        options.banner.show('errorOffline');
        return 'owned';
      }
      spendErrorReload(options.session, url);
      options.reload('error alert');
      return 'owned';
    },
    dismiss() {
      dismissed = findErrorAlert(options.doc);
    },
  };
}
