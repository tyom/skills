// Composes a recorded clip with its captions and pointer into a 60fps MP4 via HyperFrames.
// Two clips of the same flow (before and after a change) play in two panes under shared captions.
// Usage: node compose.ts <video dir> [<after video dir>] [options], see --help.
import { parseArgs } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { align, chain, cursor, layout, retime, timeline, type Panel, type Segment } from './timeline.ts';

const help = `node compose.ts <video dir> [<after video dir>] [options]
  Two video dirs: before and after a change, side by side (stacked for wide pages), aligned at each caption.
  --size      landscape | portrait | square | WxH   (default: from the page's shape)
  --panel     none | side | bottom                  (default: side on landscape, bottom otherwise; none without captions)
  --pointer   cursor | tap | none                   (default: cursor for pages 1024px or wider, tap otherwise)
  --crop      x,y,width,height in page CSS pixels   (default: the whole page)
  --labels    before,after pane labels, such as Bug,Fixed  (default: Before,After)
  --theme     dark | light                          (default: dark)
  --out       output MP4                            (default: <first video dir>/final.mp4)
  --no-render write the HyperFrames project only`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: 'string' },
    panel: { type: 'string' },
    pointer: { type: 'string' },
    crop: { type: 'string' },
    labels: { type: 'string', default: 'Before,After' },
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
if (!positionals.length) fail('pass the video dir that holds clip.mp4 and clip.json');
if (positionals.length > 2) fail('pass one video dir, or two: before, then after');

interface Size {
  width: number;
  height: number;
}
const clips = positionals.map((dir) => {
  if (!existsSync(path.join(dir, 'clip.json'))) fail(`no clip.json in ${dir}; record with the screen-capture recorder`);
  const clip = JSON.parse(readFileSync(path.join(dir, 'clip.json'), 'utf8'));
  return { dir, ...(clip as { viewport: Size; video: Size }), ...timeline(clip) };
});
const compare = clips.length === 2;
const { viewport, video } = clips[0];
if (compare) {
  const [a, b] = clips;
  if (a.viewport.width !== b.viewport.width || a.viewport.height !== b.viewport.height)
    fail(`the pages differ (${a.viewport.width}x${a.viewport.height} before, ${b.viewport.width}x${b.viewport.height} after): record both on the same target size`);
  if (a.captions.length !== b.captions.length)
    fail(`before has ${a.captions.length} captions and after ${b.captions.length}: the same flow must caption both`);
  const k = a.captions.findIndex((c, i) => c.text !== b.captions[i].text);
  if (k >= 0) fail(`caption ${k + 1} differs: "${a.captions[k].text}" before, "${b.captions[k].text}" after`);
}

const labels = values.labels!.split(',').map((l) => l.trim());
if (labels.length !== 2 || labels.some((l) => !l)) fail('--labels is two names, before then after, such as Bug,Fixed');
if (!compare && values.labels !== 'Before,After') console.warn('compose: --labels applies only to a before and after');

// Two clips play on one timeline: each caption starts at the same moment in both.
const aligned = compare ? align(clips) : undefined;
const duration = aligned?.duration ?? clips[0].duration;
const captions = clips[0].captions.map((c, i) => ({ ...c, start: aligned?.starts[i] ?? c.start }));
const panes = clips.map((c, i) => ({
  ...c,
  src: compare ? `${['before', 'after'][i]}.mp4` : 'clip.mp4',
  label: compare ? labels[i] : undefined,
  pointer: aligned ? c.pointer.map((e) => ({ ...e, t: retime(aligned.segments[i], e.t) })) : c.pointer,
}));

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

// Wide pages stack, tall pages sit side by side; the canvas follows the shape of the whole.
const stack = crop.width >= crop.height;
const shape = !compare ? crop : stack ? { width: crop.width, height: 2 * crop.height } : { width: 2 * crop.width, height: crop.height };
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
  : shape.width >= shape.height
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

const fontSize = Math.round(Math.min(canvas.width, canvas.height) / 30);
const radius = Math.round(Math.min(canvas.width, canvas.height) / 60);
// Before/after labels get a row above each pane, so they never cover the page.
const label = compare ? Math.round(fontSize * 1.2) : 0;
const { slots, panel: box } = layout(canvas, panel, crop, { panes: panes.length, stack, label });
const { scale } = slots[0];
const dpr = video.width / viewport.width;
if (scale > dpr)
  console.warn(
    `compose: the clip is upscaled ${(scale / dpr).toFixed(2)}x (${Math.round(crop.width * dpr)}px of source in ${slots[0].width}px); record at a higher --dpr or crop less`,
  );

const s = (n: number) => +n.toFixed(3);
const pct = (t: number) => `${s((Math.min(Math.max(t, 0), duration) / duration) * 100)}%`;

// Pointer: positions are page CSS px; the stage transform scales and crops them with the video.
let pointerCss = '';
if (pointerMode === 'cursor')
  pointerCss += `
    .cursor { left: 0; top: 0; width: 22px; height: 30px; z-index: 3; transform-origin: 2px 2px; }
    .ring { width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid var(--accent); z-index: 2; animation: ring 0.6s ease-out both; }
    @keyframes ring { from { transform: scale(0.3); opacity: 0.9; } to { transform: scale(1.6); opacity: 0; } }`;
else if (pointerMode === 'tap')
  pointerCss += `
    .touch { width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(255,255,255,.55); border: 2px solid rgba(0,0,0,.35); box-shadow: 0 2px 10px rgba(0,0,0,.25); z-index: 2; animation: touch 0.72s ease-out both; }
    @keyframes touch { 0% { transform: scale(1.4); opacity: 0; } 16.7% { transform: scale(1); opacity: 1; } 30% { transform: scale(0.85); } 65% { transform: scale(0.85); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }`;

function pointerHtml(i: number, pointer: (typeof panes)[number]['pointer']) {
  let html = '';
  if (pointerMode === 'cursor' && pointer.length) {
    const stops = cursor(pointer, { x: viewport.width / 2, y: viewport.height / 2 }, duration).map(
      (k) =>
        `${pct(k.t)} { transform: translate(${s(k.x)}px, ${s(k.y)}px) scale(${k.scale});${k.ease ? ' animation-timing-function: cubic-bezier(.45,0,.2,1);' : ''} }`,
    );
    pointerCss += `
    @keyframes cursor-move-${i} { ${[...new Set(stops)].join('\n      ')} }`;
    html += `
          <svg id="cursor-${i}" class="clip cursor" data-start="0" data-duration="${duration}" viewBox="0 0 22 30" aria-hidden="true" style="animation: cursor-move-${i} ${duration}s linear both">
            <path d="M2 2 L2 24 L8 18.5 L12.2 27.5 L16 25.8 L11.9 17 L19.5 17 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
          </svg>`;
  }
  pointer.forEach((e, k) => {
    if (e.kind !== 'tap') return;
    if (pointerMode === 'cursor')
      html += `
          <div id="ring-${i}-${k}" class="clip ring" data-start="${s(e.t)}" data-duration="0.6" style="left: ${s(e.x)}px; top: ${s(e.y)}px"></div>`;
    else if (pointerMode === 'tap')
      html += `
          <div id="touch-${i}-${k}" class="clip touch" data-start="${s(Math.max(0, e.t - 0.12))}" data-duration="0.72" style="left: ${s(e.x)}px; top: ${s(e.y)}px"></div>`;
  });
  return html;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

const panesHtml = panes
  .map(
    (p, i) => `${p.label ? `
    <div class="label" style="left: ${slots[i].x}px; top: ${slots[i].y - label}px">${escape(p.label)}</div>` : ''}
    <div class="slot" style="left: ${slots[i].x}px; top: ${slots[i].y}px; width: ${slots[i].width}px; height: ${slots[i].height}px">
      <div class="stage">
        <div class="page">
          <video id="screen-${i}" class="clip screen" src="${p.src}" muted playsinline data-start="0" data-duration="${duration}" data-playback-start="${compare ? 0 : p.offset}"></video>${pointerHtml(i, p.pointer)}
        </div>
      </div>
    </div>`,
  )
  .join('');

// Captions form a chain: each new line grows in at the bottom (its grid row opens from 0fr to 1fr,
// so no height is measured) and pushes the older ones up, which fade and leave after three more lines.
const lineCss = (k: { open: boolean; opacity: number }) =>
  k.open ? `grid-template-rows: 1fr; opacity: ${k.opacity}; transform: none` : 'grid-template-rows: 0fr; opacity: 0; transform: translateY(0.6em)';
let chainCss = '';
const chainHtml = box
  ? chain(captions, duration)
      .map((stops, i) => {
        chainCss += `
    @keyframes line-${i} { ${stops.map((k) => `${pct(k.t)} { ${lineCss(k)}; animation-timing-function: cubic-bezier(.2,.7,.2,1); }`).join(' ')} }`;
        return `
        <div id="line-${i}" class="line" style="animation-name: line-${i}"><p>${escape(captions[i].text)}</p></div>`;
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
    .slot { position: absolute; overflow: hidden; border-radius: ${radius}px; box-shadow: 0 12px 48px rgba(0,0,0,.35); }
    .stage { position: absolute; left: 0; top: 0; width: ${crop.width}px; height: ${crop.height}px; transform: scale(${scale}); transform-origin: 0 0; }
    .page { position: absolute; left: ${-crop.x}px; top: ${-crop.y}px; width: ${viewport.width}px; height: ${viewport.height}px; }
    .screen { left: 0; top: 0; width: 100%; height: 100%; }
    .label { position: absolute; height: ${label}px; padding-left: ${Math.round(radius / 2)}px; color: var(--fg); opacity: .75; font: 600 ${Math.round(fontSize * 0.7)}px/${label * 0.8}px -apple-system, "Segoe UI", Inter, Roboto, sans-serif; letter-spacing: .02em; }
    #panel { position: absolute; ${box ? `left: ${box.x}px; top: ${box.y}px; width: ${box.width}px; height: ${box.height}px;` : 'display: none;'} }
    #chain { left: 0; right: 0; top: 0; bottom: ${panel === 'bottom' ? 0 : `calc(50% - ${fontSize}px)`}; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
    .line { display: grid; animation-duration: ${duration}s; animation-timing-function: linear; animation-fill-mode: both; }
    .line p { min-height: 0; overflow: hidden; padding-top: ${Math.round(fontSize * 0.45)}px; color: var(--fg); font: 600 ${fontSize}px/1.25 -apple-system, "Segoe UI", Inter, Roboto, sans-serif; letter-spacing: -0.01em; text-align: ${panel === 'bottom' ? 'center' : 'left'}; }${chainCss}
${pointerCss}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${canvas.width}" data-height="${canvas.height}" data-no-timeline>${panesHtml}
    <div id="panel">${captionHtml}
    </div>
  </div>
</body>
</html>
`;

/** Re-times a clip onto the shared timeline: each segment moves to its `at`, and fps fills the gaps with the last frame. */
function alignVideo(src: string, offset: number, segments: Segment[], out: string) {
  const last = segments.at(-1)!;
  const shift = segments
    .slice(0, -1)
    .reduceRight((rest, g) => `if(lt(T,${g.to}),${s(g.at - g.from)}+T,${rest})`, `${s(last.at - last.from)}+T`);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', src,
    '-vf', `trim=start=${offset},setpts=PTS-STARTPTS,setpts='(${shift})/TB',fps=60,tpad=stop_mode=clone:stop_duration=${duration},format=yuv420p`,
    '-t', String(duration), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-g', '60', '-movflags', '+faststart', out,
  ]);
}

const out = path.resolve(values.out ?? path.join(clips[0].dir, 'final.mp4'));
const project = out.replace(/\.mp4$/, '') + '.hyperframes';
mkdirSync(project, { recursive: true });
panes.forEach((p, i) => {
  const src = path.join(p.dir, 'clip.mp4');
  if (aligned) alignVideo(src, p.offset, aligned.segments[i], path.join(project, p.src));
  else copyFileSync(src, path.join(project, p.src));
});
writeFileSync(path.join(project, 'index.html'), html);
// The output times to check frames at.
console.log(`compose: captions at ${captions.map((c) => s(c.start)).join(', ') || 'none'} s`);
for (const p of panes)
  console.log(`compose: ${p.label ? `${p.label.toLowerCase()} ` : ''}taps at ${p.pointer.filter((e) => e.kind === 'tap').map((e) => s(e.t)).join(', ') || 'none'} s`);
console.log(
  `compose: ${canvas.width}x${canvas.height}, ${compare ? `before/after ${stack ? 'stacked' : 'side by side'}, ` : ''}panel ${panel}, pointer ${pointerMode}, ${duration}s -> ${project}`,
);

if (!values['no-render']) {
  const bin = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'hyperframes');
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
