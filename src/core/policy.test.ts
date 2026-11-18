import { describe, expect, it } from 'vitest';
import { isReloadDue, nextPollDelay, type ReloadMoment } from './policy';
import { TIMING } from './timing';

const quiet: ReloadMoment = {
  now: 1_000_000,
  lastMoveAt: 0,
  lastAutoReloadAt: 0,
  hidden: false,
  arriving: false,
};

describe('isReloadDue', () => {
  it('waits for something to change', () => {
    expect(isReloadDue([], quiet, TIMING)).toBe(false);
  });

  it('reloads at once for an urgent change', () => {
    expect(isReloadDue(['pipeline'], quiet, TIMING)).toBe(true);
  });

  it('holds an edit until the page sat still long enough', () => {
    const justMoved = { ...quiet, lastMoveAt: quiet.now - 10_000 };
    const settled = { ...quiet, lastMoveAt: quiet.now - 30_000 };

    expect(isReloadDue(['updatedAt'], justMoved, TIMING)).toBe(false);
    expect(isReloadDue(['updatedAt'], settled, TIMING)).toBe(true);
  });

  it('spaces automatic reloads 45 s apart in a visible tab', () => {
    const recent = { ...quiet, lastAutoReloadAt: quiet.now - 30_000 };
    const later = { ...quiet, lastAutoReloadAt: quiet.now - 45_000 };

    expect(isReloadDue(['pipeline'], recent, TIMING)).toBe(false);
    expect(isReloadDue(['pipeline'], later, TIMING)).toBe(true);
  });

  it('spaces them 3 min apart in a background tab', () => {
    const recent = {
      ...quiet,
      hidden: true,
      lastAutoReloadAt: quiet.now - 120_000,
    };

    expect(isReloadDue(['pipeline'], recent, TIMING)).toBe(false);
    expect(
      isReloadDue(['pipeline'], { ...recent, lastAutoReloadAt: 0 }, TIMING),
    ).toBe(true);
  });

  it('reloads on arrival, past the gap and the settle', () => {
    const arriving = {
      ...quiet,
      arriving: true,
      lastMoveAt: quiet.now,
      lastAutoReloadAt: quiet.now,
    };

    expect(isReloadDue(['updatedAt'], arriving, TIMING)).toBe(true);
  });
});

describe('nextPollDelay', () => {
  it('polls every 15 s in front and every minute in the background', () => {
    expect(nextPollDelay(false, 0, TIMING)).toBe(15_000);
    expect(nextPollDelay(true, 0, TIMING)).toBe(60_000);
  });

  it('backs off while the API fails, up to 5 min', () => {
    expect(nextPollDelay(false, 2, TIMING)).toBe(60_000);
    expect(nextPollDelay(false, 10, TIMING)).toBe(300_000);
  });
});
