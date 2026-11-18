import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: { baseIconPath: 'assets/icon.svg' },
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
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
