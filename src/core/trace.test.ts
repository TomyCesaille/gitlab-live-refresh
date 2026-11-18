import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from './storage';
import { createLog } from './trace';

afterEach(() => {
  vi.useRealTimers();
});

function setup(debug: unknown) {
  const local = memoryStore();
  const session = memoryStore();
  if (debug !== undefined) local.set('gl-live-refresh:debug', debug);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  let hidden = false;
  const log = createLog({ local, session, hidden: () => hidden });
  return {
    local,
    session,
    log,
    hide: () => {
      hidden = true;
    },
  };
}

describe('createLog', () => {
  it('stays silent without the debug flag', () => {
    const { local, log } = setup(undefined);

    log('poll: same');
    expect(local.get('gl-live-refresh:trace')).toBeNull();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('traces each entry with the time, the tab and its visibility', () => {
    vi.useFakeTimers({ now: new Date('2026-11-18T14:00:00.123Z') });
    const { local, session, log, hide } = setup(1);
    const tab = session.get('gl-live-refresh:tab') as string | null;

    log('reload:', 'changed: pipeline');
    hide();
    log('poll', { pending: ['comments'] });

    expect(tab).toMatch(/^[a-z0-9]{1,4}$/);
    expect(local.get('gl-live-refresh:trace')).toEqual([
      `14:00:00.123 ${tab!} v reload: changed: pipeline`,
      `14:00:00.123 ${tab!} h poll {"pending":["comments"]}`,
    ]);
    expect(console.log).toHaveBeenCalledWith(
      '[gl-live-refresh] reload: changed: pipeline',
    );
  });

  it('keeps the tab id across reloads of the tab', () => {
    const local = memoryStore();
    const session = memoryStore();
    local.set('gl-live-refresh:debug', 1);
    session.set('gl-live-refresh:tab', 'abcd');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    createLog({ local, session, hidden: () => false })('x');
    expect((local.get('gl-live-refresh:trace') as string[])[0]).toContain(
      ' abcd v x',
    );
  });

  it('keeps the last 2000 entries, each cut at 400 characters', () => {
    const { local, log } = setup(1);
    local.set(
      'gl-live-refresh:trace',
      Array.from({ length: 2_000 }, (_, index) => String(index)),
    );

    log('y'.repeat(500));
    const trace = local.get('gl-live-refresh:trace') as string[];
    expect(trace).toHaveLength(2_000);
    expect(trace[0]).toBe('1');
    expect(trace.at(-1)!.endsWith('y'.repeat(400))).toBe(true);
    expect(trace.at(-1)).not.toContain('y'.repeat(401));
  });
});
