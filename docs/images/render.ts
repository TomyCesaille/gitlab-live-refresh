// Draws the website's images from the code: the real banner, in its two
// colours, the Open Graph card and the Apple touch icon. Also draws the store
// images: the banner on a page, the popup, and the Chrome Web Store promo tile.
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

const bundle = async (contents: string) =>
  (
    await build({
      stdin: { contents, resolveDir: root, loader: 'ts' },
      bundle: true,
      format: 'iife',
      write: false,
    })
  ).outputFiles
    .map((file) => file.text)
    .join('');

const showPopup = await bundle(
  `import { startPopup } from './src/extension/popup/popup.ts';
   const tab = { id: 1, url: 'https://gitlab.example.com/group/project/-/merge_requests/42' };
   void startPopup(document, {
     tabs: { query: async () => [tab], reload: async () => {} },
     permissions: { contains: async () => false, request: async () => true, remove: async () => true },
   }, () => {});`,
);

const showBanner = await bundle(
  `import { createBanner } from './src/core/dom/banner.ts';
   window.showBanner = (mode, details) =>
     createBanner(document, { onReload() {}, onDismiss() {} }, 3).show(mode, details);`,
);

function screenshot(
  html: string,
  width: number,
  height: number,
  out: string,
  scale = 2,
) {
  const page = join(work, `${String(Math.random()).slice(2)}.html`);
  return writeFile(page, html).then(() => {
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${String(width)},${String(height)}`,
      `--force-device-scale-factor=${String(scale)}`,
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
   <p>The reload button for GitLab, pressed for you. Pages reload themselves when something changes, never while you type.</p></div>`,
  1280,
  640,
  og,
);
await sharp(og).resize(1280, 640).png().toFile(join(publicDir, 'og.png'));

// Store screenshots, 1280x800, the size the Chrome Web Store takes. The stores
// show them about 600px wide, so each is a close-up: the top right corner of an
// abstract merge request, 512x320 at 2.5x, where the banner and the popup read
// at their real size.
const store = join(root, 'docs/images/store');
const STORE_WIDTH = 512;
const STORE_HEIGHT = 320;
const STORE_SCALE = 1280 / STORE_WIDTH;
const mergeRequestPage = `
  <style>
    body { margin: 0; background: #fafafa; font: 13px system-ui; }
    .top { height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 14px;
           background: #ececec; border-bottom: 1px solid #d6d6d6; }
    .logo { width: 24px; height: 24px; border-radius: 6px; background: #c8c8c8; flex: none; }
    .search { width: 110px; height: 28px; border-radius: 14px; background: #fff; }
    .main { padding: 22px 24px; }
    .row { height: 9px; margin: 0 0 14px; border-radius: 5px; background: #dedede; }
    .title { height: 20px; width: 62%; margin: 4px 0 16px; border-radius: 6px; background: #cfcfcf; }
    .tabs { display: flex; gap: 18px; margin: 20px 0 18px; padding-bottom: 10px;
            border-bottom: 1px solid #e0e0e0; }
    .tabs div { width: 64px; height: 9px; border-radius: 5px; background: #d6d6d6; }
    .card { padding: 14px; margin-bottom: 14px; border: 1px solid #e3e3e3; border-radius: 8px;
            background: #fff; display: flex; align-items: center; gap: 12px; }
    .pill { width: 64px; height: 20px; border-radius: 10px; flex: none; }
    .pass { background: #c3e6cb; } .run { background: #bcd7f5; }
    .card .row { flex: 1; margin: 0; }
    .w30 { width: 30%; } .w45 { width: 45%; } .w60 { width: 60%; } .w80 { width: 80%; }
  </style>
  <div class="top"><div class="logo"></div><div class="search"></div></div>
  <div class="main">
    <div class="row w30"></div><div class="title"></div><div class="row w45"></div>
    <div class="tabs"><div></div><div></div><div></div><div></div></div>
    <div class="card"><div class="pill pass"></div><div class="row"></div></div>
    <div class="card"><div class="pill run"></div><div class="row"></div></div>
    <div class="row w80"></div><div class="row w60"></div><div class="row"></div>
  </div>`;

await screenshot(
  `<!doctype html><meta charset="utf-8">${mergeRequestPage}
   <script>${showBanner}; showBanner('updates', { changes: 'pipeline, comments', why: 'you are typing' });</script>`,
  STORE_WIDTH,
  STORE_HEIGHT,
  join(work, 'store-banner.png'),
  STORE_SCALE,
);

const popupStyle = await readFile(
  join(root, 'src/entrypoints/popup/style.css'),
  'utf8',
);
const iconUri = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;
await screenshot(
  `<!doctype html><meta charset="utf-8">
   <style>
     .toolbar { height: 40px; display: flex; align-items: center; justify-content: flex-end;
                gap: 14px; padding: 0 14px; background: #dcdcdc; border-bottom: 1px solid #c8c8c8; }
     .toolbar .url { flex: 1; height: 26px; border-radius: 13px; background: #f4f4f4; }
     .toolbar img { width: 20px; height: 20px; }
     .popup { position: fixed; top: 46px; right: 8px; border-radius: 8px; overflow: hidden;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); border: 1px solid #c8c8c8; }
     .popup iframe { display: block; width: 332px; height: 136px; border: 0; }
   </style>
   <div class="toolbar"><div class="url"></div><img src="${iconUri}" alt=""></div>
   ${mergeRequestPage}
   <div class="popup"><iframe srcdoc="${`<!doctype html><meta charset='utf-8'>
     <style>${popupStyle}</style>
     <header><img src='${iconUri}' alt='' width='20' height='20'><h1>GitLab Live Refresh</h1></header>
     <script>${showPopup}</script>`
       .replaceAll('&', '&amp;')
       .replaceAll('"', '&quot;')}"></iframe></div>`,
  STORE_WIDTH,
  STORE_HEIGHT,
  join(work, 'store-popup.png'),
  STORE_SCALE,
);

// The Chrome Web Store's small promo tile, 440x280.
await screenshot(
  `<!doctype html><meta charset="utf-8">
   <style>
     body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center;
            gap: 22px; padding: 0 30px; box-sizing: border-box; background: #0d0d0d;
            color: #e5e5e5; font-family: system-ui, -apple-system, sans-serif; }
     img { width: 96px; height: 96px; flex: none; }
     h1 { margin: 0; font: 700 25px/1.15 'SF Mono', Menlo, monospace; color: #fff; }
     p { margin: 12px 0 0; font-size: 15px; line-height: 1.35; color: #b0b0b0; }
   </style>
   <img src="${iconUri}" alt="">
   <div><h1>GitLab Live Refresh</h1>
   <p>The reload button for GitLab, pressed for you.</p></div>`,
  440,
  280,
  join(work, 'store-promo.png'),
);

for (const [name, width, height] of [
  ['banner', 1280, 800],
  ['popup', 1280, 800],
  ['promo', 440, 280],
] as const) {
  await sharp(join(work, `store-${name}.png`))
    .resize(width, height)
    .png()
    .toFile(join(store, `${name}.png`));
}

console.log(
  'wrote banner.png, apple-touch-icon.png and og.png to docs/public, and the store images to docs/images/store',
);
