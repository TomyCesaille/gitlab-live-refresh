# Changelog

gitlab-live-refresh's user-facing changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0] - 2026-11-18

### Added

- A browser extension for Chrome and Firefox (Manifest V3). Its background
  worker reads GitLab every minute for background tabs, frozen ones included,
  and reloads a tab that changed, unless you left unsent work on it. Tabs on
  the same page share one read.
- Turn live refresh on per site from the extension's icon: it asks for that one
  site's permission.
- A website, https://tomycesaille.github.io/gitlab-live-refresh/.

### Changed

- The userscript runs on the merge request, pipeline and job pages of any
  GitLab host, with no setup, and updates itself from the latest release.
- The userscript and the extension share one TypeScript core, tested at 100%.

## [1.6.0] - 2026-11-18

### Added

- Coming back to a tab checks it at once, and reloads it before you start
  reading when something changed.
- Automatic reloads are 45 seconds apart, 3 minutes in a background tab.
- A debug trace across tabs and reloads, behind
  `localStorage['gl-live-refresh:debug']`.

## [1.4.0] - 2026-11-18

### Changed

- An edit alone (a bot rewriting its comment, a description change) waits until
  the page sits still for 30 seconds; CI, comments, commits and approvals still
  reload at once.

## [1.3.0] - 2026-11-18

### Added

- The pipeline list reloads when a stage changes, under the list's filters.

## [1.2.0] - 2026-11-18

### Added

- A reload puts you back where you were scrolled.
- The banner says what changed and what the reload waits for, and waits on a
  text selection or an open menu too.

### Fixed

- A failed side request or a transient merge status no longer reads as a change.
- "Something went wrong" reloads at most 3 times per page until you reload it
  yourself, instead of 3 times every 10 minutes.

## [1.1.0] - 2026-11-18

- The first userscript: reloads merge request, pipeline and job pages when
  GitLab's API shows a change, never while you type.
