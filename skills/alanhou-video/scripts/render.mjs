/**
 * render.mjs — single-file HTML animation -> MP4, on this machine.
 *
 * Usage:
 *   node scripts/render.mjs [options] scene1.html [scene2.html ...]
 *     -o <out.mp4>        output path (default ./video.mp4)
 *     -d <sec|auto>       per-scene duration; "auto" probes the animation length (default auto)
 *     -f <fps>            frames per second (default 30)
 *     -s <WxH>            resolution (default 1920x1080)
 *     -p <preview|final>  render profile (default final)
 *     -a <audio-file>     audio file to mux into the final video (bgm, narration, etc.)
 *     --no-cache          skip scene content cache, always re-render
 *
 * Multiple scenes render individually and are concatenated with ffmpeg.
 * Requires: playwright (npm install in this skill dir) + ffmpeg on PATH.
 *
 * Recording strategy (ported from nexu-io/html-video adapter-hyperframes,
 * Apache-2.0): freeze all CSS animations before parse, wait for web fonts,
 * probe the real animation length (CSS keyframes + finite GSAP tweens),
 * unfreeze as recording t=0, then trim the dead lead-in and encode.
 *
 * v0.2.0 additions:
 * - Render profiles: preview (960p/24fps/ultrafast/crf28) vs final (original)
 * - Scene-level content hash caching (skip re-render if HTML unchanged)
 * - Automatic post-render verification report (ffprobe-based)
 * - Audio muxing: --audio/-a to bake in a BGM or narration track
 */

import { mkdtemp, readdir, rm, writeFile, mkdir, readFile, stat, copyFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ========== profile presets ==========
const PROFILES = {
  preview: {
    maxLongEdge: 960,
    maxFps: 24,
    preset: 'ultrafast',
    crf: 28,
    label: 'preview',
  },
  final: {
    maxLongEdge: null,   // keep original
    maxFps: null,        // keep original
    preset: 'medium',
    crf: 20,
    label: 'final',
  },
};

// ========== args ==========
const argv = process.argv.slice(2);
const scenes = [];
let outPath = 'video.mp4';
let duration = 'auto';
let fps = 30;
let width = 1920, height = 1080;
let profileName = 'final';
let audioPath = null;
let useCache = true;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o') outPath = argv[++i];
  else if (a === '-d') duration = argv[++i];
  else if (a === '-f') fps = Number(argv[++i]) || 30;
  else if (a === '-s') { const m = /^(\d+)x(\d+)$/.exec(argv[++i] || ''); if (m) { width = +m[1]; height = +m[2]; } }
  else if (a === '-p' || a === '--profile') profileName = argv[++i];
  else if (a === '-a' || a === '--audio') audioPath = resolve(argv[++i]);
  else if (a === '--no-cache') useCache = false;
  else if (a === '-h' || a === '--help') {
    console.log(`alanhou-video render.mjs — HTML scenes -> MP4

Options:
  -o <path>        Output path (default video.mp4)
  -d <sec|auto>    Per-scene duration (default auto)
  -f <fps>         Frames per second (default 30)
  -s <WxH>         Resolution (default 1920x1080)
  -p <profile>     Render profile: preview | final (default final)
  -a <audio>       Audio file to mux (bgm, narration)
  --no-cache       Skip scene content cache
  -h, --help       Show this help`);
    process.exit(0);
  }
  else scenes.push(resolve(a));
}
if (!scenes.length) { console.error('error: no input HTML given'); process.exit(1); }
for (const s of scenes) if (!existsSync(s)) { console.error(`error: not found: ${s}`); process.exit(1); }
if (audioPath && !existsSync(audioPath)) { console.error(`error: audio not found: ${audioPath}`); process.exit(1); }
const profile = PROFILES[profileName];
if (!profile) { console.error(`error: unknown profile "${profileName}". Use: preview | final`); process.exit(1); }

const explicit = duration !== 'auto';
const explicitSec = explicit ? Math.max(0.5, Number(duration)) : 0;

// Apply profile constraints to resolution and fps
let effectiveWidth = width;
let effectiveHeight = height;
let effectiveFps = fps;
if (profile.maxLongEdge) {
  const longEdge = Math.max(width, height);
  if (longEdge > profile.maxLongEdge) {
    const scale = profile.maxLongEdge / longEdge;
    effectiveWidth = Math.round(width * scale / 2) * 2;   // must be even for h264
    effectiveHeight = Math.round(height * scale / 2) * 2;
  }
}
if (profile.maxFps && fps > profile.maxFps) {
  effectiveFps = profile.maxFps;
}

const { chromium } = await import('playwright').catch(() => {
  console.error('error: playwright not installed. Run in this skill dir: npm install && npx playwright install chromium');
  process.exit(1);
});

// ========== cache helpers ==========
const SKILL_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CACHE_DIR = join(SKILL_ROOT, '.cache', 'scenes');

async function hashFile(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function sceneCacheKey(htmlPath, prof, w, h, f, dur) {
  // Cache key includes: content hash + render params
  const paramStr = `${prof}:${w}x${h}@${f}:${dur}`;
  return createHash('sha256')
    .update(paramStr)
    .digest('hex')
    .slice(0, 8);
}

async function getCachedScene(htmlPath, paramKey) {
  if (!useCache) return null;
  try {
    const contentHash = await hashFile(htmlPath);
    const cacheFile = join(CACHE_DIR, `${contentHash}-${paramKey}.mp4`);
    if (existsSync(cacheFile)) {
      const s = await stat(cacheFile);
      if (s.size > 0) {
        return cacheFile;
      }
    }
  } catch { /* cache miss */ }
  return null;
}

async function putCachedScene(htmlPath, paramKey, mp4Path) {
  if (!useCache) return;
  try {
    const contentHash = await hashFile(htmlPath);
    await mkdir(CACHE_DIR, { recursive: true });
    const cacheFile = join(CACHE_DIR, `${contentHash}-${paramKey}.mp4`);
    await copyFile(mp4Path, cacheFile);
  } catch { /* best-effort cache write */ }
}

// ========== ffmpeg / ffprobe ==========
function ffmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', c => err += c);
    p.on('error', e => rej(e.code === 'ENOENT' ? new Error('ffmpeg not found: brew install ffmpeg') : e));
    p.on('exit', c => c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}: ${err.slice(-1500)}`)));
  });
}

function ffprobeDuration(path) {
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', c => out += c);
    p.on('error', e => rej(e.code === 'ENOENT' ? new Error('ffprobe not found: brew install ffmpeg') : e));
    p.on('exit', c => c === 0 ? res(parseFloat(out) || 0) : rej(new Error('ffprobe failed')));
  });
}

function ffprobeJson(path) {
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      path,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', c => out += c);
    p.on('error', e => rej(e));
    p.on('exit', c => {
      try { res(JSON.parse(out)); } catch { rej(new Error('ffprobe json parse failed')); }
    });
  });
}

// ========== scene render ==========
async function renderScene(browser, htmlPath, mp4Path) {
  // Playwright always records at the requested viewport, then ffmpeg
  // re-encodes to the effective (possibly downscaled) resolution.
  const recordDir = await mkdtemp(join(tmpdir(), 'av-rec-'));
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: { dir: recordDir, size: { width, height } },
  });
  const page = await context.newPage();

  // Freeze every CSS animation before the document parses, so nothing plays
  // during page load / font fetch. Unfreezing later is the animation's t=0.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.id = '__av_freeze';
    style.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
    const attach = () => (document.head || document.documentElement).appendChild(style);
    if (document.head || document.documentElement) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
    window.__avUnfreeze = () => document.getElementById('__av_freeze')?.remove();
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded' });

  // Wait for web fonts: stylesheet <link>s first (they register @font-face),
  // then force-load each face, then fonts.ready. Capped so a blocked CDN
  // can't stall the render.
  await page.evaluate(() => new Promise((done) => {
    const fonts = document.fonts;
    if (!fonts?.ready?.then) return done();
    let settled = false;
    const finish = () => { if (!settled) { settled = true; requestAnimationFrame(() => requestAnimationFrame(done)); } };
    const cap = setTimeout(finish, 8000);
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => {
      try { if (l.sheet?.cssRules) return Promise.resolve(); } catch { /* pending */ }
      return new Promise(r => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); setTimeout(r, 6000); });
    });
    Promise.all(links)
      .then(() => { const loads = []; fonts.forEach(f => { try { loads.push(f.load().catch(() => {})); } catch { /* pre-paint */ } }); return Promise.all(loads); })
      .then(() => fonts.ready)
      .then(() => { clearTimeout(cap); finish(); })
      .catch(() => { clearTimeout(cap); finish(); });
  })).catch(() => {});
  await page.waitForTimeout(100);

  // Probe the real animation length: longest finite CSS animation
  // (duration+delay, skipping infinite background loops) and longest finite
  // GSAP tween if gsap is on the page.
  let totalSec = explicit ? explicitSec : 5;
  try {
    const animMs = await page.evaluate(() => {
      let max = 0;
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        const durs = (s.animationDuration || '').split(',');
        const dels = (s.animationDelay || '').split(',');
        const iters = (s.animationIterationCount || '').split(',');
        durs.forEach((d, i) => {
          if ((iters[i] || '').trim() === 'infinite') return;
          max = Math.max(max, ((parseFloat(d) || 0) + (parseFloat(dels[i] || '0') || 0)) * 1000);
        });
      }
      let gsapMs = 0;
      const children = window.gsap?.globalTimeline?.getChildren?.(true, true, true) ?? [];
      for (const c of children) {
        const repeat = typeof c.repeat === 'function' ? c.repeat() : (c.vars?.repeat ?? 0);
        if (repeat === -1) continue;
        const td = typeof c.totalDuration === 'function' ? c.totalDuration() : 0;
        if (Number.isFinite(td)) gsapMs = Math.max(gsapMs, td * 1000);
      }
      return Math.max(max, gsapMs);
    });
    const needed = Math.min(30, (animMs + 400) / 1000);
    if (!explicit && needed > totalSec) totalSec = needed;
  } catch { /* keep fallback duration */ }

  // Drive paused GSAP master timelines (multi-composition convention), then
  // release the CSS freeze — this moment is the animation's true t=0.
  await page.evaluate(() => {
    const tls = window.__timelines || {};
    for (const k of Object.keys(tls)) if (typeof tls[k]?.play === 'function') tls[k].play(0);
    window.__avUnfreeze?.();
  }).catch(() => {});

  process.stderr.write(`  recording ${totalSec.toFixed(1)}s @ ${effectiveFps}fps [${profile.label}]...\n`);
  await page.waitForTimeout(Math.round(totalSec * 1000));
  await context.close();

  const webms = (await readdir(recordDir)).filter(f => f.endsWith('.webm')).sort();
  if (!webms.length) throw new Error('playwright produced no webm');
  const webm = join(recordDir, webms[webms.length - 1]);

  // Keep the LAST totalSec of the webm.
  const webmSec = await ffprobeDuration(webm).catch(() => 0);
  const seekSec = webmSec > totalSec + 0.15 ? Math.max(0, webmSec - totalSec - 0.1) : 0;

  // Build scale filter if profile requires downscaling
  const scaleFilters = [];
  if (effectiveWidth !== width || effectiveHeight !== height) {
    scaleFilters.push(`scale=${effectiveWidth}:${effectiveHeight}`);
  }
  if (explicit) {
    scaleFilters.push(`tpad=stop_mode=clone:stop_duration=${totalSec}`);
  }
  const vfArgs = scaleFilters.length ? ['-vf', scaleFilters.join(',')] : [];

  await ffmpeg([
    '-y',
    ...(seekSec > 0 ? ['-ss', seekSec.toFixed(3)] : []),
    '-i', webm,
    ...vfArgs,
    '-t', String(totalSec),
    '-r', String(effectiveFps),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', profile.preset, '-crf', String(profile.crf),
    '-movflags', '+faststart',
    mp4Path,
  ]);
  await rm(recordDir, { recursive: true, force: true }).catch(() => {});
  return totalSec;
}

// ========== verification report ==========
async function verifyOutput(mp4Path, sceneCount, sceneDurations, renderTimeMs) {
  const report = {
    status: 'ok',
    file: mp4Path,
    profile: profile.label,
    scenes: sceneCount,
    sceneDurations: sceneDurations.map(d => +d.toFixed(2)),
    expectedDuration: +sceneDurations.reduce((a, b) => a + b, 0).toFixed(2),
    audio: audioPath ? basename(audioPath) : null,
    renderTimeSeconds: +(renderTimeMs / 1000).toFixed(1),
    cache: useCache ? 'enabled' : 'disabled',
    errors: [],
  };

  try {
    const info = await ffprobeJson(mp4Path);
    const fmt = info.format || {};
    const videoStream = (info.streams || []).find(s => s.codec_type === 'video');
    const audioStream = (info.streams || []).find(s => s.codec_type === 'audio');

    report.actualDuration = +(parseFloat(fmt.duration) || 0).toFixed(2);
    report.fileSize = fmt.size ? `${(parseInt(fmt.size) / 1024 / 1024).toFixed(1)} MB` : 'unknown';

    if (videoStream) {
      report.resolution = `${videoStream.width}x${videoStream.height}`;
      report.codec = videoStream.codec_name;
      report.pixFmt = videoStream.pix_fmt;
      // Parse fps from r_frame_rate (e.g. "30/1")
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        report.fps = den ? +(num / den).toFixed(1) : num;
      }
    } else {
      report.errors.push('no video stream found');
    }

    if (audioStream) {
      report.audioCodec = audioStream.codec_name;
      report.audioSampleRate = audioStream.sample_rate;
    }

    // Sanity checks
    const durationDiff = Math.abs(report.actualDuration - report.expectedDuration);
    if (durationDiff > 1.0) {
      report.errors.push(`duration mismatch: expected ~${report.expectedDuration}s, got ${report.actualDuration}s (diff ${durationDiff.toFixed(1)}s)`);
    }
    if (videoStream && videoStream.pix_fmt !== 'yuv420p') {
      report.errors.push(`unexpected pixel format: ${videoStream.pix_fmt} (expected yuv420p)`);
    }
    if (report.errors.length > 0) {
      report.status = 'warning';
    }
  } catch (e) {
    report.status = 'error';
    report.errors.push(`ffprobe failed: ${e.message}`);
  }

  return report;
}

// ========== audio muxing ==========
async function muxAudio(videoPath, audioFile, outputPath) {
  // Mux audio into video: keep video codec, encode audio as AAC,
  // trim to shortest stream so BGM doesn't extend past video.
  const tempOut = outputPath + '.mux-tmp.mp4';
  await ffmpeg([
    '-y',
    '-i', videoPath,
    '-i', audioFile,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    tempOut,
  ]);
  // Atomic replace: remove original, rename temp
  await rm(videoPath, { force: true });
  const { rename } = await import('node:fs/promises');
  await rename(tempOut, outputPath);
}

// ========== main ==========
const startTime = Date.now();
const outAbs = resolve(outPath);
await mkdir(dirname(outAbs), { recursive: true });

process.stderr.write(`profile: ${profile.label} | resolution: ${effectiveWidth}x${effectiveHeight} | fps: ${effectiveFps}\n`);
if (audioPath) process.stderr.write(`audio: ${audioPath}\n`);

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const sceneDurations = [];
try {
  if (scenes.length === 1) {
    const paramKey = sceneCacheKey(scenes[0], profile.label, effectiveWidth, effectiveHeight, effectiveFps, duration);
    const cached = await getCachedScene(scenes[0], paramKey);
    if (cached) {
      process.stderr.write(`scene 1/1: ${scenes[0]} (cache hit)\n`);
      await copyFile(cached, outAbs);
      const dur = await ffprobeDuration(outAbs).catch(() => 5);
      sceneDurations.push(dur);
    } else {
      const sec = await renderScene(browser, scenes[0], outAbs);
      sceneDurations.push(sec);
      await putCachedScene(scenes[0], paramKey, outAbs);
    }
  } else {
    const workDir = await mkdtemp(join(tmpdir(), 'av-concat-'));
    const parts = [];
    for (let i = 0; i < scenes.length; i++) {
      const paramKey = sceneCacheKey(scenes[i], profile.label, effectiveWidth, effectiveHeight, effectiveFps, duration);
      const cached = await getCachedScene(scenes[i], paramKey);
      if (cached) {
        process.stderr.write(`scene ${i + 1}/${scenes.length}: ${scenes[i]} (cache hit)\n`);
        const part = join(workDir, `part-${String(i).padStart(2, '0')}.mp4`);
        await copyFile(cached, part);
        const dur = await ffprobeDuration(part).catch(() => 5);
        sceneDurations.push(dur);
        parts.push(part);
      } else {
        process.stderr.write(`scene ${i + 1}/${scenes.length}: ${scenes[i]}\n`);
        const part = join(workDir, `part-${String(i).padStart(2, '0')}.mp4`);
        const sec = await renderScene(browser, scenes[i], part);
        sceneDurations.push(sec);
        parts.push(part);
        await putCachedScene(scenes[i], paramKey, part);
      }
    }
    const listPath = join(workDir, 'list.txt');
    await writeFile(listPath, parts.map(p => `file '${p}'`).join('\n'));
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outAbs]);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
} finally {
  await browser.close().catch(() => {});
}

// Mux audio if provided
if (audioPath) {
  process.stderr.write(`muxing audio: ${basename(audioPath)}...\n`);
  await muxAudio(outAbs, audioPath, outAbs);
}

// Verification report
const renderTimeMs = Date.now() - startTime;
const report = await verifyOutput(outAbs, scenes.length, sceneDurations, renderTimeMs);

// Output
if (report.status === 'ok' || report.status === 'warning') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
