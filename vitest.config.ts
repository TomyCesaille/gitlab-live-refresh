import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

const BROWSER_TESTS = 'src/**/*.browser.test.ts';

export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        plugins: [WxtVitest()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, BROWSER_TESTS],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        // Layout: jsdom lays nothing out, headless Chromium does. WXT's fake
        // extension APIs stay out: they only load in Node.
        extends: true,
        test: {
          name: 'browser',
          include: [BROWSER_TESTS],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        // the CLI wrapper around the tested buildUserscript()
        'scripts/build-userscript.ts',
      ],
      thresholds: { 100: true },
    },
  },
});
