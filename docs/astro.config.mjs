import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://TomyCesaille.github.io',
  base: '/gitlab-live-refresh',
  // The repo root's tsconfig.json extends one WXT generates, absent from a
  // website-only install: Vite stops searching here.
  vite: { tsconfig: './tsconfig.json' },
});
