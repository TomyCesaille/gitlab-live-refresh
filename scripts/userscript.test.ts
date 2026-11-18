// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildUserscript } from './userscript';

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('buildUserscript', () => {
  it('writes one file: the metadata block, then the bundled watcher', async () => {
    dir = await mkdtemp(join(tmpdir(), 'userscript-'));
    const outFile = join(dir, 'nested', 'gitlab-live-refresh.user.js');

    const code = await buildUserscript(outFile);
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      version: string;
    };

    expect(await readFile(outFile, 'utf8')).toBe(code);
    expect(code.startsWith('// ==UserScript==\n')).toBe(true);
    expect(code).toContain(`// @version      ${pkg.version}\n`);
    const [, bundle] = code.split('// ==/UserScript==\n\n');
    expect(bundle).toMatch(/^("use strict";\n)?\(\(\) => \{/);
    expect(code).not.toMatch(/^import /m);
  }, 20_000);
});
