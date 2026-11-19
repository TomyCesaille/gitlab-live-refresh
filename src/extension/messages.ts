import type { PageRef } from '../core/page';
import type { ReloadMarker } from '../core/session';

export type ToBackground =
  // A page loaded or the page changed in place: the background takes the
  // baseline and hands back the marker of the reload that brought it here.
  | {
      type: 'hello';
      page: PageRef | null;
      url: string;
      visible: boolean;
      busy: boolean;
    }
  // A visible tab asks whether anything changed.
  | { type: 'check'; arriving: boolean }
  // The tab went to the background, with or without unsent work on it.
  | { type: 'away'; busy: boolean }
  // You dismissed the banner.
  | { type: 'acknowledge' }
  // The page is about to reload itself.
  | { type: 'reloading'; reason: string; manual: boolean };

export interface HelloReply {
  reload: ReloadMarker | null;
}

export interface CheckReply {
  changed: string[];
  lastMoveAt: number;
  lastAutoReloadAt: number;
  failed: boolean;
}

export const NOTHING_NEW: CheckReply = {
  changed: [],
  lastMoveAt: 0,
  lastAutoReloadAt: 0,
  failed: false,
};
