Build from the attached sources with Node 22.23.4 (the version in .nvmrc):

    npm ci
    npx wxt zip -b firefox

The add-on is .output/gitlab-live-refresh-<version>-firefox.zip. The sources are
TypeScript bundled by WXT (Vite); nothing is minified by hand or fetched at
build time.

To try it on a public GitLab page, no account needed:

1. Open https://gitlab.com/gitlab-org/gitlab/-/pipelines
2. Click the toolbar icon, then "Turn on for gitlab.com", and allow the site.
3. The page reloads itself when the pipeline list changes on GitLab, usually
   within a minute on that project. A banner, top right, says what changed when
   a reload has to wait (while you type, select text or have a menu open).

What it does with its permissions:

- Host permission: requested at run time for the one site you turn on, never at
  install. The add-on reads that site's GitLab REST and GraphQL APIs with GET
  requests and the user's own session, and nothing else.
- scripting: registers its content script on the sites you granted.
- storage (session area): per-tab state, cleared when the browser closes.
- alarms: a check of background tabs once a minute.

No data leaves the browser except those reads to the GitLab site the user
turned on. No analytics, no remote code.
