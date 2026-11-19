# AGENTS.md

Notes for an AI agent changing gitlab-live-refresh. [README.md](README.md) says
what it does; this file says how the code is laid out and the rules it holds to.

## Layout

One TypeScript core, two runtimes: a browser extension built with WXT, and a
userscript bundled with esbuild.

| Path | Holds |
|---|---|
| `src/core/page.ts` | Which GitLab page a URL is: merge request, pipeline, pipeline list, job. The page key two tabs on the same page share. |
| `src/core/gitlab.ts` | The GitLab client: REST and GraphQL, both over GET, with the session cookie. |
| `src/core/fingerprint.ts` | What each page type compares, read from the API. |
| `src/core/changes.ts`, `tracker.ts` | Change detection: baseline, latest, what changed, when it last moved. Plain data. |
| `src/core/policy.ts` | When a change is due a reload: urgent or settled, the gaps after a reload, arrival. |
| `src/core/timing.ts` | Every delay in one place. The README quotes them: keep both in step. |
| `src/core/session.ts`, `storage.ts`, `trace.ts` | Per-tab memory across reloads, safe storage, the debug trace. |
| `src/core/dom/` | Everything that reads or writes the page: what holds a reload back, scroll save and restore, the banner, "Something went wrong" alerts. |
| `src/userscript/` | The userscript: the in-page loop (`watcher.ts`) and its metadata block (`header.ts`). |
| `src/extension/background/` | The extension's background: per-tab state in `storage.session`, the shared reads, the sweep of background tabs, the sites' content script registration, and the wiring to `browser` (`start.ts`). |
| `src/extension/content/` | The extension's visible-tab side: when you can take a reload, the banner, scroll, alerts. |
| `src/extension/popup/` | Turning live refresh on or off for the current site. |
| `src/entrypoints/` | WXT entrypoints, one-line calls into `src/extension/`. WXT reads every file in this folder as an entrypoint: their tests live in `src/extension/entrypoints.test.ts`. |
| `scripts/` | The userscript build. |
| `test/` | Test helpers: a fake GitLab, a fake window, fake extension APIs. |
| `docs/` | The website, an Astro site. `docs/images/render.ts` draws its images from the code. |

## Rules to hold

- **Never reload while the user is mid-gesture.** Typing, a draft on screen, a
  selection, an open menu or dialog, or input in the last 8 seconds hold a
  reload back; the banner says which. Only the first check after the user comes
  back to the tab skips the idle wait, and never the other blockers.
- **Read-only against GitLab.** The client issues GETs, GraphQL included, and
  nothing else reaches GitLab. No data leaves the browser except those reads to
  the user's own instance.
- **One decision core.** The userscript and the extension share `src/core`: a
  rule changes there, once, for both.
- **An unknown value is never a change.** A failed side request or a transient
  merge status reads as `undefined` in the fingerprint and is absorbed, not
  reported.
- **The extension background owns background tabs.** Chrome freezes background
  pages, timers and workers included: only the background can read and reload
  them. A tab whose page reported unsent work when it went away is never
  reloaded from the background.
- **Per-site opt-in.** The extension holds no host permission until the user
  grants one site from the popup; the content script runs on the granted sites
  only.
- **The userscript identity is fixed.** `@name` and `@namespace`
  (`https://gitlab.com/`) are how Violentmonkey recognises the installed copy:
  changing either installs a second one.

## Testing

- Vitest in two projects: `unit` on jsdom, and `browser` in headless Chromium
  (Playwright) for `*.browser.test.ts`, which check layout: where the banner
  sits and that it stays inside GitLab's top bar. Coverage counts both: 100%
  line, branch, function and statement coverage, enforced by `vitest.config.ts`
  and CI. The one exclusion is `scripts/build-userscript.ts`,
  the CLI wrapper around the tested `buildUserscript()`.
- Logic takes its world as arguments: a window, a `send` function, a session
  storage area, a `fetch`. Tests pass fakes from `test/` rather than mocking
  modules; `vi.mock` is kept for the entrypoints.
- Timers are faked (`vi.useFakeTimers`); drive them with
  `vi.advanceTimersByTimeAsync`.
- jsdom lays nothing out: `test/dom.ts` gives an element a size, and
  `vitest.setup.ts` supplies `checkVisibility`. A rule about real sizes or
  positions gets a browser test instead.
- Name tests after what the user sees.

## Conventions

- Strict TypeScript with `noUncheckedIndexedAccess`; ESLint `strictTypeChecked`
  and `stylisticTypeChecked`; Prettier.
- Comments say why, in the present tense, in a line or three. No history (what
  the code used to do), no restating the code, no task markers.
- Conventional Commits.

## Technology stack

| Technology | Version | Why |
|---|---|---|
| WXT | ^0.21 | One codebase for Chrome and Firefox MV3: manifests per browser, zips, dev mode with hot reload. `imports: false` keeps imports explicit. |
| @wxt-dev/auto-icons | ^1.1 | Every icon size from `src/assets/icon.svg`. |
| esbuild | ^0.28 | Bundles the userscript to one IIFE behind its metadata block. |
| TypeScript | ~6.0 | Stay on 6.0: typescript-eslint caps its peer range below 6.1, and TypeScript 7 (the native compiler) only ships an unstable API. |
| Vitest, @vitest/coverage-v8, jsdom | ^5, ^5, ^31 | Native ESM and TypeScript, fake timers, V8 coverage. |
| @vitest/browser-playwright, Playwright | ^5, ^1.65 | Vitest's browser mode: layout tests in headless Chromium, in the same coverage. |
| ESLint, typescript-eslint, eslint-config-prettier | ^10, ^8.73, ^10 | Flat config through `defineConfig`. |
| Prettier, Husky, lint-staged | ^3, ^9, ^17 | Formatting, and a pre-commit hook on staged files. |
| Astro | ^7.4 (docs) | Static website on GitHub Pages, deployed by `withastro/action`. |

## Node versions

| Context | Version | Why |
|---|---|---|
| CI and release | `.nvmrc` (22.23.4) | Type stripping runs `scripts/*.ts` without a build step from 22.18. |
| Website deploy | `docs/.nvmrc` (22.23.4) | Astro 7.4 needs 22.23.4 or later; `withastro/action` takes no version file, so the workflow reads it. |
