import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { userscriptHeader } from '../src/userscript/header.ts';

const root = new URL('../', import.meta.url);

export async function buildUserscript(outFile: string): Promise<string> {
  const pkg = JSON.parse(
    await readFile(new URL('package.json', root), 'utf8'),
  ) as { version: string };
  const result = await build({
    entryPoints: [fileURLToPath(new URL('src/userscript/main.ts', root))],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    legalComments: 'none',
  });
  const bundle = result.outputFiles.map((file) => file.text).join('');
  const code = `${userscriptHeader(pkg.version)}\n\n${bundle}`;
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, code);
  return code;
}
