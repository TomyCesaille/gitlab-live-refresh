import { isUrgent } from './changes';
import type { Timing } from './timing';

export interface ReloadMoment {
  now: number;
  lastMoveAt: number;
  lastAutoReloadAt: number;
  hidden: boolean;
  // The first check after you come back to the tab: reload before you start
  // reading, without the idle wait or the edit settle.
  arriving: boolean;
}

export function isReloadDue(
  changed: readonly string[],
  moment: ReloadMoment,
  timing: Timing,
): boolean {
  if (changed.length === 0) return false;
  if (moment.arriving) return true;
  const gap = moment.hidden ? timing.hiddenReloadGapMs : timing.reloadGapMs;
  if (moment.now - moment.lastAutoReloadAt < gap) return false;
  return (
    isUrgent(changed) || moment.now - moment.lastMoveAt >= timing.editSettleMs
  );
}

export function nextPollDelay(
  hidden: boolean,
  failures: number,
  timing: Timing,
): number {
  const base = hidden ? timing.hiddenPollMs : timing.pollMs;
  return Math.min(base * 2 ** failures, timing.maxBackoffMs);
}
