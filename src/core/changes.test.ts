import { describe, expect, it } from 'vitest';
import {
  absorbUnknowns,
  changedKeys,
  describeChanges,
  isUrgent,
} from './changes';

describe('changedKeys', () => {
  it('names the keys whose value moved', () => {
    expect(
      changedKeys({ a: 1, b: 'x', c: null }, { a: 2, b: 'x', c: 'y' }),
    ).toEqual(['a', 'c']);
  });

  it('never counts an unknown value as a change', () => {
    expect(changedKeys({ a: 1 }, { a: undefined })).toEqual([]);
  });
});

describe('absorbUnknowns', () => {
  it('adopts the first known value of a key the reference missed', () => {
    expect(absorbUnknowns({ a: undefined, b: 1 }, { a: 'x', b: 2 })).toEqual({
      a: 'x',
      b: 1,
    });
  });

  it('keeps a key unknown while it stays unknown', () => {
    expect(absorbUnknowns({ a: undefined }, { a: undefined })).toEqual({
      a: undefined,
    });
  });
});

describe('isUrgent', () => {
  it('reads an edit alone as not urgent', () => {
    expect(isUrgent(['updatedAt'])).toBe(false);
  });

  it('reads anything beyond an edit as urgent', () => {
    expect(isUrgent(['updatedAt', 'comments'])).toBe(true);
  });
});

describe('describeChanges', () => {
  it('names the changes in plain words', () => {
    expect(describeChanges(['pipeline', 'mergeability'])).toBe(
      'pipeline, merge status',
    );
  });

  it('names edits only when nothing more specific changed', () => {
    expect(describeChanges(['updatedAt'])).toBe('edits');
    expect(describeChanges(['comments', 'updatedAt'])).toBe('comments');
  });

  it('falls back to the key for a change it has no word for', () => {
    expect(describeChanges(['novel'])).toBe('novel');
  });
});
