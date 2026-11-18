import { buildUserscript } from './userscript.ts';

const outFile = 'dist/gitlab-live-refresh.user.js';
await buildUserscript(outFile);
console.log(`built ${outFile}`);
