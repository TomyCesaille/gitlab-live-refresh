// Draws the website's images from the code: the real banner, in its two
// colours, the Open Graph card and the Apple touch icon.
//
//   node docs/images/render.ts
//
// Needs Google Chrome for the screenshots; sharp comes with the dev dependencies.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = fileURLToPath(new URL('../../', import.meta.url));
const publicDir = join(root, 'docs/public');
const work = await mkdtemp(join(tmpdir(), 'gitlab-live-refresh-images-'));

const showBanner = (
  await build({
    stdin: {
      contents: `import { createBanner } from './src/core/dom/banner.ts';
        window.showBanner = (mode, details) =>
          createBanner(document, { onReload() {}, onDismiss() {} }, 3).show(mode, details);`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
  })
).outputFiles
  .map((file) => file.text)
  .join('');

function screenshot(html: string, width: number, height: number, out: string) {
  const page = join(work, `${String(Math.random()).slice(2)}.html`);
  return writeFile(page, html).then(() => {
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${String(width)},${String(height)}`,
      '--force-device-scale-factor=2',
      `--screenshot=${out}`,
      `file://${page}`,
    ]);
  });
}

// An abstract page behind the banner, top bar included: no GitLab screen, no
// real data.
const backdrop = `
  <style>
    body { margin: 0; background: #f5f5f5; font: 13px system-ui; }
    .bar { height: 48px; background: #e8e8e8; border-bottom: 1px solid #d6d6d6; }
    .search { width: 34%; height: 28px; margin: 10px 18px; border-radius: 14px; background: #fff; }
    .row { height: 10px; margin: 14px 18px; border-radius: 5px; background: #dedede; }
    .row.short { width: 40%; } .row.mid { width: 65%; }
  </style>
  <div class="bar"><div class="search"></div></div>
  <div class="row mid"></div><div class="row"></div><div class="row short"></div>`;

const bannerShot = async (mode: string, details: object, out: string) => {
  await screenshot(
    `<!doctype html><meta charset="utf-8">${backdrop}
     <script>${showBanner}; showBanner(${JSON.stringify(mode)}, ${JSON.stringify(details)});</script>`,
    560,
    120,
    out,
  );
};

const update = join(work, 'update.png');
const error = join(work, 'error.png');
await bannerShot(
  'updates',
  { changes: 'pipeline, comments', why: 'you are typing' },
  update,
);
await bannerShot('error', { why: 'text is selected' }, error);
const [top, bottom] = await Promise.all(
  [update, error].map((file) => sharp(file).toBuffer()),
);
const { width = 1120, height = 240 } = await sharp(top).metadata();
await sharp({
  create: { width, height: height * 2, channels: 4, background: '#f5f5f5' },
})
  .composite([
    { input: top, top: 0, left: 0 },
    { input: bottom, top: height, left: 0 },
  ])
  .png()
  .toFile(join(publicDir, 'banner.png'));

const icon = await readFile(join(root, 'src/assets/icon.svg'), 'utf8');
await sharp(Buffer.from(icon), { density: 600 })
  .resize(180, 180)
  .png()
  .toFile(join(publicDir, 'apple-touch-icon.png'));

const og = join(work, 'og.png');
await screenshot(
  `<!doctype html><meta charset="utf-8">
   <style>
     body { margin: 0; width: 1280px; height: 640px; display: flex; align-items: center;
            gap: 56px; padding: 0 110px; box-sizing: border-box; background: #0d0d0d; color: #e5e5e5;
            font-family: system-ui, -apple-system, sans-serif; }
     img { width: 200px; height: 200px; flex: none; }
     h1 { margin: 0; font: 700 64px/1.1 'SF Mono', Menlo, monospace; color: #fff; }
     p { margin: 22px 0 0; font-size: 30px; line-height: 1.35; color: #b0b0b0; }
   </style>
   <img src="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}" alt="">
   <div><h1>GitLab Live Refresh</h1>
   <p>F5 for GitLab, done for you. Pages reload themselves when something changes, never while you type.</p></div>`,
  1280,
  640,
  og,
);
await sharp(og).resize(1280, 640).png().toFile(join(publicDir, 'og.png'));

console.log('wrote banner.png, apple-touch-icon.png and og.png to docs/public');
