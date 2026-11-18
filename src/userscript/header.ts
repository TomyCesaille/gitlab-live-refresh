const REPOSITORY = 'https://github.com/TomyCesaille/gitlab-live-refresh';
const WEBSITE = 'https://tomycesaille.github.io/gitlab-live-refresh';
const RELEASE = `${REPOSITORY}/releases/latest/download/gitlab-live-refresh.user.js`;

// The path patterns match GitLab's merge request, pipeline and job pages on
// any host, so a self-hosted instance needs no setup.
const MATCHES = [
  'https://*/*/-/merge_requests/*',
  'https://*/*/-/pipelines*',
  'https://*/*/-/jobs/*',
];

export function userscriptHeader(version: string): string {
  const fields: [string, string][] = [
    // Kept as first published, so Violentmonkey updates the installed copy
    // rather than adding a second one.
    ['namespace', 'https://gitlab.com/'],
    ['name', 'GitLab Live Refresh'],
    ['version', version],
    [
      'description',
      'GitLab merge request, pipeline and job pages that reload themselves when something changes, never while you type.',
    ],
    ['author', 'Joris La Cancellera'],
    ['homepageURL', WEBSITE],
    ['supportURL', `${REPOSITORY}/issues`],
    ['icon', `${WEBSITE}/favicon.svg`],
    ['downloadURL', RELEASE],
    ['updateURL', RELEASE],
    ...MATCHES.map((match): [string, string] => ['match', match]),
    ['grant', 'none'],
    ['noframes', ''],
    ['run-at', 'document-idle'],
  ];
  const lines = fields.map(([key, value]) =>
    `// @${key.padEnd(12)} ${value}`.trimEnd(),
  );
  return ['// ==UserScript==', ...lines, '// ==/UserScript=='].join('\n');
}
