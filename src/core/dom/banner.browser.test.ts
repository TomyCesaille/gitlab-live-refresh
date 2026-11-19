import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { describeChanges } from '../changes';
import { createBanner, type BannerDetails, type BannerMode } from './banner';
import { BLOCKER_TEXT } from './blockers';

// GitLab's top bar, over the page's own buttons.
const TOP_BAR_PX = 48;

const LONGEST_WHY = Object.values(BLOCKER_TEXT).reduce((a, b) =>
  b.length > a.length ? b : a,
);
const EVERY_CHANGE = describeChanges([
  'state',
  'commits',
  'comments',
  'pipeline',
  'mergeability',
  'approvals',
  'downstream',
]);

beforeAll(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function show(mode: BannerMode, details?: BannerDetails) {
  const handlers = { onReload: vi.fn(), onDismiss: vi.fn() };
  createBanner(document, handlers, 3).show(mode, details);
  const shadow = document.getElementById('gl-live-refresh')!.shadowRoot!;
  return {
    box: shadow.querySelector('.bar')!.getBoundingClientRect(),
    lines: [...shadow.querySelectorAll('.title, .detail')],
  };
}

const cutShort = (line: Element) => line.scrollWidth > line.clientWidth;

describe('banner layout', () => {
  it.each<[BannerMode, BannerDetails]>([
    ['updates', { changes: EVERY_CHANGE, why: LONGEST_WHY }],
    ['error', { why: LONGEST_WHY }],
    ['errorOffline', {}],
    ['errorStuck', {}],
  ])(
    'sits top right, inside the top bar, whatever %s says',
    (mode, details) => {
      const { box } = show(mode, details);
      const viewport = document.documentElement.clientWidth;

      expect(box.top).toBe(4);
      expect(viewport - box.right).toBe(8);
      expect(box.bottom).toBeLessThanOrEqual(TOP_BAR_PX);
      expect(box.width).toBeLessThanOrEqual(480);
    },
  );

  it.each<[BannerMode, BannerDetails]>([
    ['updates', { changes: 'pipeline, comments', why: LONGEST_WHY }],
    ['error', { why: LONGEST_WHY }],
    ['errorOffline', {}],
    ['errorStuck', {}],
  ])('says a usual %s message in full', (mode, details) => {
    const { lines } = show(mode, details);

    expect(lines.filter(cutShort)).toEqual([]);
  });

  it('cuts a long list of changes short rather than spill onto the page', () => {
    const { lines } = show('updates', {
      changes: EVERY_CHANGE,
      why: LONGEST_WHY,
    });

    expect(lines.map(cutShort)).toEqual([true, false]);
  });
});
