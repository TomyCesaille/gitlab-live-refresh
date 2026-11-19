# Changelog

gitlab-live-refresh's user-facing changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-19

The first release.

### Added

- Merge request, pipeline, pipeline list and job pages reload themselves when
  GitLab's API shows a change: CI, comments, commits, approvals, merge status.
  An edit alone (a bot rewriting its comment, a description change) waits until
  the page sits still for 30 seconds.
- A reload never cuts you off: it waits while you type, leave unsent text,
  select text, keep a menu or dialog open, or used the page in the last 8
  seconds. A banner in the top right corner, inside GitLab's top bar, says what
  changed and what the reload waits for.
- Coming back to a tab checks it at once, and reloads it before you start
  reading. Automatic reloads are 45 seconds apart, 3 minutes in a background
  tab.
- A reload puts you back where you were scrolled.
- A "Something went wrong" alert reloads the page, at most 3 times until you
  reload it yourself.
- A browser extension for Chrome and Firefox (Manifest V3). Its background reads
  GitLab every minute for background tabs, frozen ones included, and reloads a
  tab that changed, unless you left unsent work on it. Tabs on the same page
  share one read. Turn it on per site from its icon: it asks for that one site's
  permission and starts in that site's open tabs at once.
- A userscript with the same rules, on the merge request, pipeline and job pages
  of any GitLab host. It updates itself from the latest release.
- A debug trace across tabs and reloads, behind
  `localStorage['gl-live-refresh:debug']`.
