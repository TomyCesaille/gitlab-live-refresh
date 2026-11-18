# Contributing

Bug reports and pull requests are welcome. [AGENTS.md](AGENTS.md) describes the
layout and the rules the code holds to; read it before a change of any size.

## Set up

Node 22.18 or later (`.nvmrc` pins the version CI uses).

```bash
git clone https://github.com/TomyCesaille/gitlab-live-refresh
cd gitlab-live-refresh
npm install
```

## Check a change

```bash
npm test             # vitest, with coverage
npm run lint
npm run typecheck
npm run format:check
npm run build        # Chrome, Firefox and the userscript
```

CI runs the same steps and fails a pull request under 100% line, branch,
function and statement coverage. A pre-commit hook runs ESLint and Prettier on
the staged files.

## Try it in a browser

```bash
npm run dev          # Chrome, with hot reload
npm run dev:firefox
```

Or load `.output/chrome-mv3` unpacked in `chrome://extensions`, then turn live
refresh on for a GitLab site from the extension's icon. The userscript builds to
`dist/gitlab-live-refresh.user.js`; serve the folder
(`python3 -m http.server -d dist`) and open the file's URL to install it in
Violentmonkey.

The debug trace (see the README) shows every check, wait and reload.

## Pull requests

- One change per pull request, with tests for the behaviour it adds or fixes;
  coverage stays at 100%.
- Name tests after what the user sees: `reloads the moment you come back`, not
  `sets arrivalPending on focus`.
- Title commits and pull requests with Conventional Commits: `feat:`, `fix:`,
  `refactor:`, `docs:`, `chore:`.
- Note user-facing changes under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).

## The website

The website, https://tomycesaille.github.io/gitlab-live-refresh/, is an Astro
site in `docs/`, deployed by `.github/workflows/website.yml` on every push to
`main` that touches it:

```bash
cd docs
npm install
npm run dev
```

`node docs/images/render.ts` redraws its images from the code: the banner, the
Open Graph card and the touch icon. It needs Google Chrome.

## Releasing

1. Set the version in `package.json`, and move the `Unreleased` entries of
   CHANGELOG.md under a heading for it.
2. Once CI passes on that commit, tag it `v<version>` and push the tag.
3. The tag runs the release workflow: it builds the Chrome and Firefox zips, the
   Firefox sources zip and the userscript, and publishes a GitHub release with
   them. The userscript's `@updateURL` points at the latest release, so
   installed copies update themselves.
