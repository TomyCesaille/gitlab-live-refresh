import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  imports: false,
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: { baseIconPath: 'assets/icon.svg' },
  // The sources zip is what Firefox Add-ons reviewers rebuild the add-on from.
  zip: {
    includeSources: ['**/*', '.nvmrc'],
    excludeSources: [
      'docs/**',
      '.github/**',
      'coverage/**',
      '.vitest/**',
      'dist/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'GitLab Live Refresh',
    description:
      'GitLab merge request, pipeline and job pages that reload themselves when something changes, never while you type.',
    permissions: ['storage', 'alarms', 'scripting', 'activeTab'],
    optional_host_permissions: ['https://*/*'],
    action: { default_title: 'GitLab Live Refresh' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'gitlab-live-refresh@tomycesaille.github.io',
          // the first Firefox that reads data_collection_permissions, an ESR
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
