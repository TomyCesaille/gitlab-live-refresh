import { describe, expect, it } from 'vitest';
import { acknowledge, emptyTracker, observe } from './tracker';

describe('observe', () => {
  it('takes the first observation as the baseline', () => {
    const state = observe(emptyTracker(), { status: 'running' }, 100);

    expect(state).toEqual({
      snapshot: {
        baseline: { status: 'running' },
        latest: { status: 'running' },
      },
      changed: [],
      moved: [],
      lastMoveAt: 0,
    });
  });

  it('reports what differs from the baseline and when it last moved', () => {
    let state = observe(emptyTracker(), { status: 'running' }, 100);
    state = observe(state, { status: 'success' }, 200);

    expect(state.changed).toEqual(['status']);
    expect(state.moved).toEqual(['status']);
    expect(state.lastMoveAt).toBe(200);
  });

  it('keeps the last move time while nothing moves', () => {
    let state = observe(emptyTracker(), { status: 'running' }, 100);
    state = observe(state, { status: 'success' }, 200);
    state = observe(state, { status: 'success' }, 300);

    expect(state.changed).toEqual(['status']);
    expect(state.moved).toEqual([]);
    expect(state.lastMoveAt).toBe(200);
  });

  it('does not read a value that was unknown at load as a change', () => {
    let state = observe(emptyTracker(), { approvals: undefined }, 100);
    state = observe(state, { approvals: '[0,[]]' }, 200);

    expect(state.changed).toEqual([]);
    expect(state.moved).toEqual([]);
  });
});

describe('acknowledge', () => {
  it('makes the latest observation the new baseline', () => {
    let state = observe(emptyTracker(), { status: 'running' }, 100);
    state = acknowledge(observe(state, { status: 'success' }, 200));

    expect(state.changed).toEqual([]);
    expect(observe(state, { status: 'success' }, 300).changed).toEqual([]);
  });

  it('does nothing before the first observation', () => {
    expect(acknowledge(emptyTracker())).toEqual(emptyTracker());
  });
});
