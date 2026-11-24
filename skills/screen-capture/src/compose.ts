// Composes a recorded clip with its captions and pointer into a 60fps MP4 via HyperFrames.
// Usage: bun compose.ts <video dir with clip.mp4 + clip.json> [options], see --help.
import { parseArgs } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { layout, timeline, type Panel } from './timeline.ts';

const help = `bun compose.ts <video dir> [options]
  --size      landscape | portrait | square | WxH   (default: from the page's shape)
  --panel     none | side | bottom                  (default: side on landscape, bottom otherwise; none without captions)
  --pointer   cursor | tap | none                   (default: cursor for pages 1024px or wider, tap otherwise)
  --crop      x,y,width,height in page CSS pixels   (default: the whole page)
  --theme     dark | light                          (default: dark)
  --out       output MP4                            (default: <video dir>/final.mp4)
  --no-render write the HyperFrames project only`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: 'string' },
    panel: { type: 'string' },
    pointer: { type: 'string' },
    crop: { type: 'string' },
    theme: { type: 'string', default: 'dark' },
    out: { type: 'string' },
    'no-render': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

const fail = (message: string): never => {
  console.error(`compose: ${message}\n\n${help}`);
  process.exit(1);
};

if (values.help) {
  console.log(help);
  process.exit(0);
}
const dir = positionals[0] ?? fail('pass the video dir that holds clip.mp4 and clip.json');
if (!existsSync(path.join(dir, 'clip.json'))) fail(`no clip.json in ${dir}; record with the screen-capture recorder`);
const clip = JSON.parse(readFileSync(path.join(dir, 'clip.json'), 'utf8'));
const { viewport, video } = clip as { viewport: Size; video: Size };
const { offset, duration, captions, pointer } = timeline(clip);

interface Size {
  width: number;
  height: number;
}
const oneOf = <T extends string>(name: string, value: string, options: readonly T[]): T =>
  (options as readonly string[]).includes(value) ? (value as T) : fail(`--${name} must be one of ${options.join(', ')}`);

const crop = values.crop
  ? (() => {
      const [x, y, width, height] = values.crop.split(',').map(Number);
      if ([x, y, width, height].some((n) => !Number.isFinite(n)) || width <= 0 || height <= 0) fail('--crop is x,y,width,height');
      if (x < 0 || y < 0 || x + width > viewport.width || y + height > viewport.height)
        fail(`--crop must fit inside the ${viewport.width}x${viewport.height} page`);
      return { x, y, width, height };
    })()
  : { x: 0, y: 0, ...viewport };

const named: Record<string, Size> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};
const canvas: Size = values.size
  ? named[values.size] ??
    (() => {
      const m = values.size.match(/^(\d+)x(\d+)$/) ?? fail('--size is landscape, portrait, square or WxH');
      return { width: Number(m[1]), height: Number(m[2]) };
    })()
  : crop.width >= crop.height
    ? named.landscape
    : named.portrait;
if (canvas.width % 2 || canvas.height % 2) fail('--size needs even numbers for H.264');

const panel: Panel = values.panel
  ? oneOf('panel', values.panel, ['none', 'side', 'bottom'] as const)
  : !captions.length
    ? 'none'
    : canvas.width > canvas.height
      ? 'side'
      : 'bottom';
if (panel === 'none' && captions.length) console.warn(`compose: --panel none drops ${captions.length} caption(s)`);
const pointerMode = values.pointer
  ? oneOf('pointer', values.pointer, ['cursor', 'tap', 'none'] as const)
  : viewport.width >= 1024
    ? 'cursor'
    : 'tap';
const theme = oneOf('theme', values.theme!, ['dark', 'light'] as const);

const { slot, panel: box } = layout(canvas, panel, crop);
const dpr = video.width / viewport.width;
if (slot.scale > dpr)
  console.warn(
    `compose: the clip is upscaled ${(slot.scale / dpr).toFixed(2)}x (${Math.round(crop.width * dpr)}px of source in ${slot.width}px); record at a higher --dpr or crop less`,
  );

// Pointer: positions are page CSS px; the stage transform scales and crops them with the video.
const s = (n: number) => +n.toFixed(3);
const pct = (t: number) => `${s((Math.min(Math.max(t, 0), duration) / duration) * 100)}%`;
let pointerHtml = '';
let pointerCss = '';
if (pointerMode === 'cursor' && pointer.length) {
  const stops: string[] = [];
  const at = (t: number, p: { x: number; y: number }, scale = 1, ease = false) =>
    stops.push(
      `${pct(t)} { transform: translate(${s(p.x)}px, ${s(p.y)}px) scale(${scale});${ease ? ' animation-timing-function: cubic-bezier(.45,0,.2,1);' : ''} }`,
    );
  let prev = { t: 0, x: viewport.width / 2, y: viewport.height / 2 };
  at(0, prev);
  for (const e of pointer) {
    // Leave after the previous action has played, arrive just before this one.
    at(Math.max(prev.t + 0.15, e.t - 0.55), prev, 1, true);
    at(e.t - 0.08, e);
    if (e.kind === 'tap') {
      at(e.t, e, 0.82);
      at(e.t + 0.14, e);
    }
    prev = e;
  }
  at(duration, prev);
  pointerCss += `
    #cursor { left: 0; top: 0; width: 22px; height: 30px; z-index: 3; animation: cursor-move ${duration}s linear both; transform-origin: 2px 2px; }
    @keyframes cursor-move { ${[...new Set(stops)].join('\n      ')} }
    .ring { width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid var(--accent); z-index: 2; animation: ring 0.6s ease-out both; }
    @keyframes ring { from { transform: scale(0.3); opacity: 0.9; } to { transform: scale(1.6); opacity: 0; } }`;
  pointerHtml += `
        <svg id="cursor" class="clip" data-start="0" data-duration="${duration}" viewBox="0 0 22 30" aria-hidden="true">
          <path d="M2 2 L2 24 L8 18.5 L12.2 27.5 L16 25.8 L11.9 17 L19.5 17 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        </svg>`;
  pointer.forEach((e, i) => {
    if (e.kind === 'tap')
      pointerHtml += `
        <div id="ring-${i}" class="clip ring" data-start="${e.t}" data-duration="0.6" style="left: ${s(e.x)}px; top: ${s(e.y)}px"></div>`;
  });
} else if (pointerMode === 'tap') {
  pointerCss += `
    .touch { width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(255,255,255,.55); border: 2px solid rgba(0,0,0,.35); box-shadow: 0 2px 10px rgba(0,0,0,.25); z-index: 2; animation: touch 0.72s ease-out both; }
    @keyframes touch { 0% { transform: scale(1.4); opacity: 0; } 16.7% { transform: scale(1); opacity: 1; } 30% { transform: scale(0.85); } 65% { transform: scale(0.85); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }`;
  pointer.forEach((e, i) => {
    if (e.kind === 'tap')
      pointerHtml += `
        <div id="touch-${i}" class="clip touch" data-start="${s(Math.max(0, e.t - 0.12))}" data-duration="0.72" style="left: ${s(e.x)}px; top: ${s(e.y)}px"></div>`;
  });
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
const fontSize = Math.round(Math.min(canvas.width, canvas.height) / 30);
const radius = Math.round(Math.min(canvas.width, canvas.height) / 60);

// Captions form a chain: each new line grows in at the bottom (its grid row opens from 0fr to 1fr,
// so no height is measured) and pushes the older ones up, which fade and leave after three more lines.
const FADE = [1, 0.45, 0.18, 0];
const EASE = 0.45;
let chainCss = '';
const chainHtml = box
  ? captions
      .map((c, i) => {
        const stops: [number, string][] = [
          [0, 'grid-template-rows: 0fr; opacity: 0; transform: translateY(0.6em)'],
          [c.start, 'grid-template-rows: 0fr; opacity: 0; transform: translateY(0.6em)'],
          [c.start + EASE, 'grid-template-rows: 1fr; opacity: 1; transform: none'],
        ];
        for (let k = 1; k < FADE.length && i + k < captions.length; k++) {
          const t = captions[i + k].start;
          stops.push([t, `grid-template-rows: 1fr; opacity: ${FADE[k - 1]}; transform: none`]);
          stops.push([t + EASE, `grid-template-rows: 1fr; opacity: ${FADE[k]}; transform: none`]);
        }
        stops.push([duration, stops.at(-1)![1]]);
        // Captions closer than EASE apart would put stops out of order.
        for (let k = 1; k < stops.length; k++) stops[k][0] = Math.max(stops[k][0], stops[k - 1][0]);
        chainCss += `
    @keyframes line-${i} { ${stops.map(([t, css]) => `${pct(t)} { ${css}; animation-timing-function: cubic-bezier(.2,.7,.2,1); }`).join(' ')} }`;
        return `
        <div id="line-${i}" class="line" style="animation-name: line-${i}"><p>${escape(c.text)}</p></div>`;
      })
      .join('')
  : '';
const captionHtml = box
  ? `
      <div id="chain" class="clip" data-start="0" data-duration="${duration}">${chainHtml}
      </div>`
  : '';
const colours = theme === 'dark' ? { bg: '#0e0f12', fg: '#f4f4f5', accent: '#5b9dff' } : { bg: '#f2f2ef', fg: '#141414', accent: '#2563eb' };

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${canvas.width}, height=${canvas.height}" />
  <style>
    :root { --bg: ${colours.bg}; --fg: ${colours.fg}; --accent: ${colours.accent}; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; background: var(--bg); }
    .clip { position: absolute; }
    #slot { position: absolute; left: ${slot.x}px; top: ${slot.y}px; width: ${slot.width}px; height: ${slot.height}px; overflow: hidden; border-radius: ${radius}px; box-shadow: 0 12px 48px rgba(0,0,0,.35); }
    #stage { position: absolute; left: 0; top: 0; width: ${crop.width}px; height: ${crop.height}px; transform: scale(${slot.scale}); transform-origin: 0 0; }
    #page { position: absolute; left: ${-crop.x}px; top: ${-crop.y}px; width: ${viewport.width}px; height: ${viewport.height}px; }
    #screen { left: 0; top: 0; width: 100%; height: 100%; }
    #panel { position: absolute; ${box ? `left: ${box.x}px; top: ${box.y}px; width: ${box.width}px; height: ${box.height}px;` : 'display: none;'} }
    #chain { left: 0; right: 0; top: 0; bottom: ${panel === 'bottom' ? 0 : `calc(50% - ${fontSize}px)`}; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
    .line { display: grid; animation-duration: ${duration}s; animation-timing-function: linear; animation-fill-mode: both; }
    .line p { min-height: 0; overflow: hidden; padding-top: ${Math.round(fontSize * 0.45)}px; color: var(--fg); font: 600 ${fontSize}px/1.25 -apple-system, "Segoe UI", Inter, Roboto, sans-serif; letter-spacing: -0.01em; text-align: ${panel === 'bottom' ? 'center' : 'left'}; }${chainCss}
${pointerCss}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${canvas.width}" data-height="${canvas.height}" data-no-timeline>
    <div id="slot">
      <div id="stage">
        <div id="page">
          <video id="screen" class="clip" src="clip.mp4" muted playsinline data-start="0" data-duration="${duration}" data-playback-start="${offset}"></video>${pointerHtml}
        </div>
      </div>
    </div>
    <div id="panel">${captionHtml}
    </div>
  </div>
</body>
</html>
`;

const out = path.resolve(values.out ?? path.join(dir, 'final.mp4'));
const project = out.replace(/\.mp4$/, '') + '.hyperframes';
mkdirSync(project, { recursive: true });
copyFileSync(path.join(dir, 'clip.mp4'), path.join(project, 'clip.mp4'));
writeFileSync(path.join(project, 'index.html'), html);
console.log(`compose: ${canvas.width}x${canvas.height}, panel ${panel}, pointer ${pointerMode}, ${duration}s -> ${project}`);

if (!values['no-render']) {
  const bin = path.join(import.meta.dir, '..', 'node_modules', '.bin', 'hyperframes');
  const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1' };
  const run = (args: string[]) => {
    const r = spawnSync(bin, args, { stdio: 'inherit', env });
    if (r.status !== 0) process.exit(r.status ?? 1);
  };
  run(['lint', project]);
  run([
    'render', project, '--fps', '60', '--quality', 'high', '--chroma-subsampling', '444',
    '--video-frame-format', 'png', '--quiet', '-o', out,
  ]);
  console.log(`compose: wrote ${out}`);
}
