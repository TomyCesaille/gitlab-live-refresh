import { describe, expect, it } from 'vitest';
import { userscriptHeader } from './header';

describe('userscriptHeader', () => {
  const header = userscriptHeader('0.1.0');
  const field = (key: string) =>
    header
      .split('\n')
      .filter((line) => line.startsWith(`// @${key} `))
      .map((line) => line.slice(`// @${key} `.length).trim());

  it('frames the metadata block', () => {
    expect(header.startsWith('// ==UserScript==\n')).toBe(true);
    expect(header.endsWith('\n// ==/UserScript==')).toBe(true);
  });

  it('keeps the identity Violentmonkey updates the installed copy by', () => {
    expect(field('name')).toEqual(['GitLab Live Refresh']);
    expect(field('namespace')).toEqual(['https://gitlab.com/']);
    expect(field('version')).toEqual(['0.1.0']);
  });

  it('matches merge request, pipeline and job pages on any host', () => {
    expect(field('match')).toEqual([
      'https://*/*/-/merge_requests/*',
      'https://*/*/-/pipelines*',
      'https://*/*/-/jobs/*',
    ]);
  });

  it('updates itself from the latest GitHub release', () => {
    const release =
      'https://github.com/TomyCesaille/gitlab-live-refresh/releases/latest/download/gitlab-live-refresh.user.js';
    expect(field('downloadURL')).toEqual([release]);
    expect(field('updateURL')).toEqual([release]);
  });

  it('runs in the top page only, once it has loaded', () => {
    expect(header).toContain('\n// @noframes\n');
    expect(field('run-at')).toEqual(['document-idle']);
    expect(field('grant')).toEqual(['none']);
  });
});
