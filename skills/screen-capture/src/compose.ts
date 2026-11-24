// Composes a recorded clip with its captions and pointer into a 60fps MP4 via HyperFrames,
// or with --stills into one PNG per caption and a sheet of them all.
// Two clips of the same flow (before and after a change) play in two panes under shared captions.
// Usage: node compose.ts <video dir> [<after video dir>] [options], see --help.
import { parseArgs } from 'node:util';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { align, chain, contentBox, cursor, layout, retime, stills, timeline, type Panel, type Segment, type Size } from './timeline.ts';
import type { RecordedClip } from './clip.ts';

const help = `node compose.ts <video dir> [<after video dir>] [options]
  Two video dirs: before and after a change, side by side (stacked for wide pages), aligned at each caption.
  --size      landscape | portrait | square | WxH   (default: from the page's shape)
  --panel     none | side | bottom                  (default: side on landscape, bottom otherwise; none without captions)
  --pointer   cursor | tap | none                   (default: cursor for pages 1024px or wider, tap otherwise)
  --crop      x,y,width,height in page CSS pixels, or none for the full recorded screen
              (default: the area any frame shows content in, from the page background)
  --labels    before,after pane labels, such as Bug,Fixed  (default: Before,After)
  --theme     dark | light                          (default: dark)
  --stills    one PNG per caption, at the last frame of its beat, plus sheet.png with every beat
  --out       output MP4, or with --stills a folder  (default: <first video dir>/final.mp4 or /stills)
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
    stills: { type: 'boolean', default: false },
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

const clips = positionals.map((dir) => {
  if (!existsSync(path.join(dir, 'clip.json'))) fail(`no clip.json in ${dir}; record with the screen-capture recorder`);
  const clip: RecordedClip = JSON.parse(readFileSync(path.join(dir, 'clip.json'), 'utf8'));
  return { dir, viewport: clip.viewport, video: clip.video, ...timeline(clip) };
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

if (values.stills && !clips[0].captions.length) fail('--stills takes one still per caption, and the clip has none');

const labels = values.labels!.split(',').map((l) => l.trim());
if (labels.length !== 2 || labels.some((l) => !l)) fail('--labels is two names, before then after, such as Bug,Fixed');
if (!compare && values.labels !== 'Before,After') console.warn('compose: --labels applies only to a before and after');

// Two clips play on one timeline: each caption starts at the same moment in both (one clip maps onto itself).
const aligned = align(clips);
const { duration } = aligned;
const captions = clips[0].captions.map((c, i) => ({ ...c, start: aligned.starts[i] }));
const panes = clips.map((c, i) => ({
  ...c,
  src: compare ? `${['before', 'after'][i]}.mp4` : 'clip.mp4',
  label: compare ? labels[i] : undefined,
  pointer: c.pointer.map((e) => ({ ...e, t: retime(aligned.segments[i], e.t) })),
}));

const oneOf = <T extends string>(name: string, value: string, options: readonly T[]): T =>
  (options as readonly string[]).includes(value) ? (value as T) : fail(`--${name} must be one of ${options.join(', ')}`);

/** The box around content in any frame of a clip, read at half the CSS size as the frames stream past. */
async function clipContent(c: (typeof clips)[number], w: number, h: number) {
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error', '-ss', String(c.offset), '-i', path.join(c.dir, 'clip.mp4'),
    '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const size = w * h * 3;
  // One frame buffer, filled chunk by chunk: a chunk can end one frame and start the next.
  const frame = Buffer.alloc(size);
  let filled = 0;
  let union = null as { left: number; top: number; right: number; bottom: number } | null;
  for await (const chunk of ffmpeg.stdout as AsyncIterable<Buffer>) {
    for (let at = 0; at < chunk.length; ) {
      const n = chunk.copy(frame, filled, at);
      filled += n;
      at += n;
      if (filled < size) break;
      filled = 0;
      const b = contentBox(frame, w, h);
      if (!b) continue;
      union = {
        left: Math.min(union?.left ?? b.x, b.x),
        top: Math.min(union?.top ?? b.y, b.y),
        right: Math.max(union?.right ?? 0, b.x + b.width),
        bottom: Math.max(union?.bottom ?? 0, b.y + b.height),
      };
    }
  }
  const code = await new Promise((r) => (ffmpeg.exitCode !== null ? r(ffmpeg.exitCode) : ffmpeg.once('exit', r)));
  if (code !== 0) fail(`could not read ${c.dir}/clip.mp4 to find its content`);
  return union;
}

/** The area of the page that ever shows content, in either clip, padded: the rest is background. */
async function contentCrop() {
  const w = Math.round(viewport.width / 2);
  const h = Math.round(viewport.height / 2);
  const boxes = (await Promise.all(clips.map((c) => clipContent(c, w, h)))).filter((b) => b !== null);
  if (!boxes.length) return { x: 0, y: 0, ...viewport };
  const pad = 24;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.left)) * 2 - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.top)) * 2 - pad);
  const right = Math.min(viewport.width, Math.max(...boxes.map((b) => b.right)) * 2 + pad);
  const bottom = Math.min(viewport.height, Math.max(...boxes.map((b) => b.bottom)) * 2 + pad);
  return { x, y, width: right - x, height: bottom - y };
}

const crop =
  values.crop === 'none'
    ? { x: 0, y: 0, ...viewport }
    : values.crop
      ? (() => {
          const [x, y, width, height] = values.crop.split(',').map(Number);
          if ([x, y, width, height].some((n) => !Number.isFinite(n)) || width <= 0 || height <= 0) fail('--crop is x,y,width,height or none');
          if (x < 0 || y < 0 || x + width > viewport.width || y + height > viewport.height)
            fail(`--crop must fit inside the ${viewport.width}x${viewport.height} page`);
          return { x, y, width, height };
        })()
      : await contentCrop();

// Wide pages stack, tall pages sit side by side; the canvas follows the shape of the whole.
const stack = crop.width >= crop.height;
const shape = stack ? { width: crop.width, height: panes.length * crop.height } : { width: panes.length * crop.width, height: crop.height };
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
if (![canvas.width, canvas.height].every((n) => Number.isSafeInteger(n) && n > 0 && n % 2 === 0)) fail('--size needs positive even numbers for H.264');

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
if (!(scale > 0 && slots[0].width > 0 && slots[0].height > 0)) fail(`--size ${canvas.width}x${canvas.height} leaves no room for the video`);
const dpr = video.width / viewport.width;
// Stills without --size keep the recorded pixels, so only a fixed size can upscale.
if (scale > dpr && !(values.stills && !values.size))
  console.warn(
    `compose: the clip is upscaled ${(scale / dpr).toFixed(2)}x (${Math.round(crop.width * dpr)}px of source in ${slots[0].width}px); record at a higher --dpr or crop less`,
  );

const s = (n: number) => +n.toFixed(3);
const pct = (t: number) => `${s((Math.min(Math.max(t, 0), duration) / duration) * 100)}%`;

// Pointer: positions are page CSS px; the stage transform scales and crops them with the video.
const pointerCss = {
  cursor: `
    .cursor { left: 0; top: 0; width: 22px; height: 30px; z-index: 3; transform-origin: 2px 2px; }
    .ring { width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid var(--accent); z-index: 2; animation: ring 0.6s ease-out both; }
    @keyframes ring { from { transform: scale(0.3); opacity: 0.9; } to { transform: scale(1.6); opacity: 0; } }`,
  tap: `
    .touch { width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(255,255,255,.55); border: 2px solid rgba(0,0,0,.35); box-shadow: 0 2px 10px rgba(0,0,0,.25); z-index: 2; animation: touch 0.72s ease-out both; }
    @keyframes touch { 0% { transform: scale(1.4); opacity: 0; } 16.7% { transform: scale(1); opacity: 1; } 30% { transform: scale(0.85); } 65% { transform: scale(0.85); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }`,
  none: '',
}[pointerMode];
/** The mark each tap leaves: a ring around the cursor, or a touch that starts just before the tap. */
const mark = pointerMode === 'cursor' ? { cls: 'ring', lead: 0, dur: 0.6 } : { cls: 'touch', lead: 0.12, dur: 0.72 };

function pointerParts(i: number, pointer: (typeof panes)[number]['pointer']) {
  if (pointerMode === 'none') return { css: '', html: '' };
  let css = '';
  let html = '';
  if (pointerMode === 'cursor' && pointer.length) {
    const stops = cursor(pointer, { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }, duration).map(
      (k) =>
        `${pct(k.t)} { transform: translate(${s(k.x)}px, ${s(k.y)}px) scale(${k.scale});${k.ease ? ' animation-timing-function: cubic-bezier(.45,0,.2,1);' : ''} }`,
    );
    css = `
    @keyframes cursor-move-${i} { ${[...new Set(stops)].join('\n      ')} }`;
    html = `
          <svg id="cursor-${i}" class="clip cursor" data-start="0" data-duration="${duration}" viewBox="0 0 22 30" aria-hidden="true" style="animation: cursor-move-${i} ${duration}s linear both">
            <path d="M2 2 L2 24 L8 18.5 L12.2 27.5 L16 25.8 L11.9 17 L19.5 17 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
          </svg>`;
  }
  pointer.forEach((e, k) => {
    if (e.kind === 'tap')
      html += `
          <div id="${mark.cls}-${i}-${k}" class="clip ${mark.cls}" data-start="${s(Math.max(0, e.t - mark.lead))}" data-duration="${mark.dur}" style="left: ${s(e.x)}px; top: ${s(e.y)}px"></div>`;
  });
  return { css, html };
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

const pointers = panes.map((p, i) => pointerParts(i, p.pointer));
/** The panes, each holding the page element `screen(i)` makes: the video, or a still. */
const panesHtml = (screen: (i: number) => string) => panes
  .map(
    (p, i) => `${p.label ? `
    <div class="label" style="left: ${slots[i].x}px; top: ${slots[i].y - label}px">${escape(p.label)}</div>` : ''}
    <div class="slot" style="left: ${slots[i].x}px; top: ${slots[i].y}px; width: ${slots[i].width}px; height: ${slots[i].height}px">
      <div class="stage">
        <div class="page">
          ${screen(i)}
        </div>
      </div>
    </div>`,
  )
  .join('');

// Captions form a chain: each new line grows in at the bottom (its grid row opens from 0fr to 1fr,
// so no height is measured) and pushes the older ones up, which fade and leave after three more lines.
const lineCss = (k: { open: boolean; opacity: number }) =>
  k.open ? `grid-template-rows: 1fr; opacity: ${k.opacity}; transform: none` : 'grid-template-rows: 0fr; opacity: 0; transform: translateY(0.6em)';
const lines = box ? chain(captions, duration) : [];
const chainCss = lines
  .map(
    (stops, i) => `
    @keyframes line-${i} { ${stops.map((k) => `${pct(k.t)} { ${lineCss(k)}; animation-timing-function: cubic-bezier(.2,.7,.2,1); }`).join(' ')} }`,
  )
  .join('');
const panelHtml = box
  ? `
    <div id="panel" style="left: ${box.x}px; top: ${box.y}px; width: ${box.width}px; height: ${box.height}px">
      <div id="chain" class="clip" data-start="0" data-duration="${duration}">${lines
        .map((_, i) => `
        <div id="line-${i}" class="line" style="animation-name: line-${i}"><p>${escape(captions[i].text)}</p></div>`)
        .join('')}
      </div>
    </div>`
  : '';
const colours = theme === 'dark' ? { bg: '#0e0f12', fg: '#f4f4f5', accent: '#5b9dff' } : { bg: '#f2f2ef', fg: '#141414', accent: '#2563eb' };
const font = '-apple-system, "Segoe UI", Inter, Roboto, sans-serif';
// Shared by the video and the stills, so a still frames the page exactly as the video does.
const baseCss = `    :root { --bg: ${colours.bg}; --fg: ${colours.fg}; --accent: ${colours.accent}; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${canvas.width}px; height: ${canvas.height}px; overflow: hidden; background: var(--bg); }
    .clip { position: absolute; }
    .slot { position: absolute; overflow: hidden; border-radius: ${radius}px; box-shadow: 0 12px 48px rgba(0,0,0,.35); }
    .stage { position: absolute; left: 0; top: 0; width: ${crop.width}px; height: ${crop.height}px; transform: scale(${scale}); transform-origin: 0 0; }
    .page { position: absolute; left: ${-crop.x}px; top: ${-crop.y}px; width: ${viewport.width}px; height: ${viewport.height}px; }
    .screen { left: 0; top: 0; width: 100%; height: 100%; }
    .label { position: absolute; height: ${label}px; padding-left: ${Math.round(radius / 2)}px; color: var(--fg); opacity: .75; font: 600 ${Math.round(fontSize * 0.7)}px/${label * 0.8}px ${font}; letter-spacing: .02em; }
    #panel { position: absolute; }
    #panel p { color: var(--fg); font: 600 ${fontSize}px/1.25 ${font}; letter-spacing: -0.01em; text-wrap: balance; text-align: ${panel === 'bottom' ? 'center' : 'left'}; }`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${canvas.width}, height=${canvas.height}" />
  <style>
${baseCss}
    #chain { left: 0; right: 0; top: 0; bottom: ${panel === 'bottom' ? 0 : `calc(50% - ${fontSize}px)`}; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
    .line { display: grid; animation-duration: ${duration}s; animation-timing-function: linear; animation-fill-mode: both; }
    .line p { min-height: 0; overflow: hidden; padding-top: ${Math.round(fontSize * 0.45)}px; }${chainCss}
${pointerCss}${pointers.map((p) => p.css).join('')}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${canvas.width}" data-height="${canvas.height}" data-no-timeline>${panesHtml(
    (i) => `<video id="screen-${i}" class="clip screen" src="${panes[i].src}" muted playsinline data-start="0" data-duration="${duration}" data-playback-start="${compare ? 0 : panes[i].offset}"></video>${pointers[i].html}`,
  )}${panelHtml}
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
    // Only an input to the render, which encodes again: a fast near-lossless encode.
    '-t', String(duration), '-c:v', 'libx264', '-crf', '10', '-preset', 'veryfast', '-g', '60', out,
  ]);
}

if (values.stills) {
  const dir = path.resolve(values.out ?? path.join(clips[0].dir, 'stills'));
  const work = path.join(dir, '.work');
  mkdirSync(work, { recursive: true });
  // Each pane's still comes from its own clip on its own times (not the shared timeline), as the full frame at native pixels.
  const times = clips.map((c) => stills(c));
  const frames = panes.map((p, i) =>
    times[i].map((t, k) => {
      const file = path.join(work, `${i}-${k}.png`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', path.join(p.dir, 'clip.mp4'), '-frames:v', '1', file]);
      if (!existsSync(file)) fail(`no frame at ${t}s in ${p.dir}/clip.mp4`);
      return path.basename(file);
    }),
  );
  /**
   * Beats as cards: each beat's shots, cropped as in the video, with its caption under them, `cols` to a row.
   * `shot` is one shot's width in CSS px, and every other size scales with it, so one still and the sheet match.
   */
  const cards = (beats: number[], shot: number, cols: number, numbered: boolean) => {
    const k = shot / crop.width;
    const u = numbered ? 1 : shot / 480;
    const px = (n: number) => `${Math.round(n * u)}px`;
    const beat = stack ? shot : panes.length * shot + (panes.length - 1) * 16 * u;
    const width = Math.round(cols * beat + (cols - 1) * 32 * u + 2 * 48 * u);
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; padding: ${px(48)}; background: ${colours.bg}; color: ${colours.fg}; font-family: ${font}; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, ${beat}px); gap: ${px(48)} ${px(32)}; align-items: start; }
    .panes { display: flex; flex-direction: ${stack ? 'column' : 'row'}; gap: ${px(16)}; }
    .label { font: 600 ${px(14)}/1 ${font}; opacity: .75; letter-spacing: .02em; margin-bottom: ${px(8)}; }
    .shot { position: relative; overflow: hidden; width: ${shot}px; height: ${Math.round(crop.height * k)}px; border-radius: ${px(12)}; box-shadow: 0 ${px(8)} ${px(28)} rgba(0,0,0,.3); }
    .shot img { position: absolute; left: ${-crop.x * k}px; top: ${-crop.y * k}px; width: ${viewport.width * k}px; height: ${viewport.height * k}px; }
    p { margin-top: ${px(16)}; font: 600 ${px(20)}/1.3 ${font}; letter-spacing: -0.01em; text-wrap: balance; text-align: ${numbered ? 'left' : 'center'}; }
    p span { opacity: .5; margin-right: .4em; }
  </style>
</head>
<body>
  <div class="grid">${beats
    .map(
      (b) => `
    <div>
      <div class="panes">${panes
        .map(
          (p, i) => `
        <div>${p.label ? `<div class="label">${escape(p.label)}</div>` : ''}<div class="shot"><img src="${frames[i][b]}" alt="" /></div></div>`,
        )
        .join('')}
      </div>
      <p>${numbered ? `<span>${b + 1}</span>` : ''}${escape(captions[b].text)}</p>
    </div>`,
    )
    .join('')}
  </div>
</body>
</html>
`;
    return { size: { width, height: 1 }, html };
  };

  // Each still: with --size, the video's layout at that size; without, a card at the recorded pixels, trimmed to it.
  const pages = captions.map((c, k) => ({
    file: `${String(k + 1).padStart(2, '0')}.png`,
    fit: !values.size,
    ...(values.size
      ? {
          size: canvas,
          html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
${baseCss}
    .screen { display: block; }
    #panel { display: flex; align-items: ${panel === 'bottom' ? 'flex-start' : 'center'}; justify-content: ${panel === 'bottom' ? 'center' : 'flex-start'}; }
  </style>
</head>
<body>${panesHtml((i) => `<img class="clip screen" src="${frames[i][k]}" alt="" />`)}${box ? `
  <div id="panel" style="left: ${box.x}px; top: ${box.y}px; width: ${box.width}px; height: ${box.height}px"><p>${escape(c.text)}</p></div>` : ''}
</body>
</html>
`,
        }
      : cards([k], Math.round(crop.width * dpr), 1, false)),
  }));

  // The sheet: every beat in reading order, wrapped into rows.
  const shot = crop.height > crop.width ? 320 : 560;
  const beat = stack ? shot : panes.length * shot + (panes.length - 1) * 16;
  const cols = Math.max(1, Math.min(captions.length, Math.floor(1800 / (beat + 32))));
  pages.push({ file: 'sheet.png', fit: true, ...cards(captions.map((_, b) => b), shot, cols, true) });

  const browser = await chromium.launch();
  try {
    const tabs = await Promise.all(
      pages.map(async (page) => {
        // Stills render at their own pixels; the sheet at 2x, so its small shots stay sharp.
        const tab = await browser.newPage({ viewport: page.size, deviceScaleFactor: page.file === 'sheet.png' ? 2 : 1 });
        const html = path.join(work, page.file.replace('.png', '.html'));
        writeFileSync(html, page.html);
        await tab.goto(pathToFileURL(html).href);
        return tab;
      }),
    );
    // Fitted stills of one set share a size: the tallest one's, as captions wrap to different line counts.
    const heights = await Promise.all(tabs.map((tab) => tab.evaluate(() => document.documentElement.scrollHeight)));
    const tallest = Math.max(...heights.slice(0, captions.length));
    for (const [i, page] of pages.entries()) {
      const sheet = page.file === 'sheet.png';
      if (page.fit && !sheet) await tabs[i].setViewportSize({ width: page.size.width, height: tallest });
      await tabs[i].screenshot({ path: path.join(dir, page.file), fullPage: sheet });
    }
  } finally {
    await browser.close();
  }
  rmSync(work, { recursive: true, force: true });
  console.log(`compose: stills at ${times.map((t) => t.join(', ')).join(' and ')} s of the clip`);
  console.log(`compose: ${values.size ? `${canvas.width}x${canvas.height}, panel ${panel}` : 'fitted to the page'}, crop ${crop.x},${crop.y},${crop.width},${crop.height}: wrote ${captions.length} stills and sheet.png -> ${dir}`);
  process.exit(0);
}

const out = path.resolve(values.out ?? path.join(clips[0].dir, 'final.mp4'));
const project = out.replace(/\.mp4$/, '') + '.hyperframes';
mkdirSync(project, { recursive: true });
panes.forEach((p, i) => {
  const src = path.join(p.dir, 'clip.mp4');
  // One clip needs no re-timing: HyperFrames skips its offset (data-playback-start).
  if (compare) alignVideo(src, p.offset, aligned.segments[i], path.join(project, p.src));
  else copyFileSync(src, path.join(project, p.src), constants.COPYFILE_FICLONE);
});
writeFileSync(path.join(project, 'index.html'), html);
// The output times to check frames at.
console.log(`compose: captions at ${captions.map((c) => s(c.start)).join(', ') || 'none'} s`);
for (const p of panes)
  console.log(`compose: ${p.label ? `${p.label.toLowerCase()} ` : ''}taps at ${p.pointer.filter((e) => e.kind === 'tap').map((e) => s(e.t)).join(', ') || 'none'} s`);
console.log(
  `compose: ${canvas.width}x${canvas.height}, ${compare ? `before/after ${stack ? 'stacked' : 'side by side'}, ` : ''}crop ${crop.x},${crop.y},${crop.width},${crop.height}, panel ${panel}, pointer ${pointerMode}, ${duration}s -> ${project}`,
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
