#!/usr/bin/env node
/*
 * xiaohei-svg.mjs — draw 小黑 (the 正文配图 visual IP) as SVG. No AI/model:
 * deterministic, editable, no keys. 小黑 is the action subject of each scene,
 * never a corner decoration (see references/xiaohei-ip.md).
 *
 *   node xiaohei-svg.mjs <scene> [--label 判断] [-o out.svg] [--png] [--w 800] [--h 600]
 *
 * scenes: idle funnel breakpoint lever stamp warning carry
 *   --label   text on lever/stamp/warning/carry (default per scene)
 *   --png     also render a PNG next to the SVG (uses Playwright)
 *   -o        output path (default ~/Downloads/xiaohei-<scene>.svg)
 *
 * Aesthetic: hand-drawn whiteboard sketch — off-white board, faint grid,
 * wobbly outlines (feTurbulence displacement), deadpan black blob, white dot
 * eyes, thin legs. Monochrome + at most one marker accent.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INK = "#141414";
const BOARD = "#fafaf7";
const GRID = "#ececec";
const ACCENT = "#d64545";

// --- 小黑 base body --------------------------------------------------------
// drawn in a ~100x150 box, anchored so (0,0) is the body center; legs reach to
// y≈95, head top at y≈-58. Returns an SVG group string placed via translate/scale.
function body({ arms = "none", lookDown = false } = {}) {
  const blob =
    "M-38,-50 C-52,-50 -50,-12 -48,8 C-47,34 -40,60 0,62 " +
    "C40,60 47,34 48,8 C50,-12 52,-50 38,-50 C20,-58 -20,-58 -38,-50 Z";
  const eyeY = lookDown ? -8 : -16;
  const legs =
    `<path d="M-16,60 C-18,76 -20,86 -22,96" /><path d="M16,60 C18,76 20,86 22,96" />`;
  let arm = "";
  if (arms === "reach") arm = `<path d="M44,2 C66,-2 84,2 96,-6" />`; // right arm reaching out
  if (arms === "up") arm = `<path d="M40,-8 C58,-22 66,-34 70,-46" />`; // right arm up holding
  if (arms === "both") arm = `<path d="M44,4 C64,2 78,6 90,2" /><path d="M-44,4 C-64,2 -78,6 -90,2" />`;
  if (arms === "carry") arm = `<path d="M40,8 C56,2 70,0 84,2" /><path d="M-40,8 C-56,2 -70,0 -84,2" />`;
  return `
  <g class="xh">
    <g class="ink-stroke">${legs}${arm}</g>
    <path class="ink-fill" d="${blob}" />
    <circle class="eye" cx="-13" cy="${eyeY}" r="6.5" />
    <circle class="eye" cx="13" cy="${eyeY}" r="6.5" />
  </g>`;
}

const label = (x, y, t, color = INK, size = 20) =>
  t ? `<text x="${x}" y="${y}" class="hand" fill="${color}" font-size="${size}" text-anchor="middle">${t}</text>` : "";

// --- scenes ----------------------------------------------------------------
const scenes = {
  idle: () => `<g transform="translate(400,300) scale(1.6)">${body()}</g>`,

  // 小黑 本体变成筛选漏斗：杂乱从顶倒入，底下只漏一两条
  funnel: ({ lab }) => `
    <g class="ink-stroke">
      <path d="M150,150 C260,140 540,140 650,150" />
      <path d="M300,210 L360,150 M420,205 L470,150 M520,215 L560,150 M250,205 L320,150" opacity="0.7"/>
    </g>
    <g transform="translate(400,330)">
      <path class="ink-fill" d="M-150,-90 C-150,-90 -40,30 -32,70 C-28,96 -14,118 0,118 C14,118 28,96 32,70 C40,30 150,-90 150,-90 C60,-70 -60,-70 -150,-90 Z"/>
      <circle class="eye" cx="-26" cy="20" r="9"/><circle class="eye" cx="26" cy="20" r="9"/>
    </g>
    <g class="ink-stroke"><path d="M400,452 C399,476 401,500 400,520"/></g>
    ${label(400, 548, lab, INK, 22)}`,

  // 小黑 卡在断点里，伸手够不到对岸
  breakpoint: ({ lab }) => `
    <g class="ink-stroke">
      <path d="M70,330 C160,326 250,330 300,330" stroke-dasharray="2 0"/>
      <path d="M500,330 C600,330 690,326 730,330" stroke-dasharray="2 0"/>
      <path d="M300,330 L348,330 M392,330 L440,330" stroke-dasharray="10 14" opacity="0.55"/>
    </g>
    <g transform="translate(300,300) scale(1.25)">${body({ arms: "reach" })}</g>
    ${label(400, 392, lab || "卡住了", INK, 18)}`,

  // 小黑 认真扳一根「判断」拉杆
  lever: ({ lab }) => `
    <g class="ink-stroke">
      <rect x="380" y="356" width="150" height="64" rx="8"/>
      <path d="M432,360 C436,320 438,288 440,262"/>
      <path d="M332,352 C372,330 408,300 438,266"/>
    </g>
    <circle cx="440" cy="256" r="13" class="ink-fill"/>
    ${label(455, 405, lab || "判断", ACCENT, 24)}
    <g transform="translate(280,360) scale(1.2)">${body({ arms: "none" })}</g>`,

  // 小黑 举大印章往飘过来的一句话上盖
  stamp: ({ lab }) => `
    <g class="ink-stroke">
      <path d="M430,452 C500,446 600,446 668,452" opacity="0.55"/>
      <path d="M455,452 L560,452" stroke-width="11" opacity="0.18"/>
    </g>
    ${label(560, 484, lab || "承接", "#999", 18)}
    <g class="ink-stroke">
      <path d="M350,338 C400,316 470,318 522,320"/>
      <rect x="494" y="350" width="56" height="30" rx="4" class="ink-fill"/>
      <path d="M522,320 L522,350"/>
      <path d="M508,392 L508,404 M522,394 L522,406 M536,392 L536,404" opacity="0.5"/>
    </g>
    <g transform="translate(290,340) scale(1.2)">${body({ arms: "none" })}</g>`,

  // 小黑 举「小心」牌站在手绘大坑边往里看
  warning: ({ lab }) => `
    <g class="ink-stroke">
      <path d="M430,372 C470,486 612,494 676,372 C700,326 560,318 500,332 C466,340 442,352 430,372 Z" fill="none"/>
    </g>
    <g transform="translate(300,338) scale(1.25)">${body({ arms: "none", lookDown: true })}</g>
    <g class="ink-stroke"><path d="M348,332 C384,300 406,272 412,236"/></g>
    <g transform="translate(412,210)">
      <path class="warn" d="M0,-32 L36,30 L-36,30 Z"/>
      ${label(0, 24, "!", BOARD, 32)}
    </g>
    ${label(566, 446, lab || "小心", ACCENT, 22)}`,

  // 小黑 搬运素材（怀里抱着一个箱子）— 箱子描边留白，黑身上才看得见
  carry: ({ lab }) => `
    <g transform="translate(380,338) scale(1.2)">${body({ arms: "none" })}</g>
    <g class="ink-stroke">
      <path d="M322,348 C312,366 320,378 334,382"/>
      <path d="M438,348 C448,366 440,378 426,382"/>
    </g>
    <g>
      <rect x="324" y="360" width="112" height="62" rx="6" fill="${BOARD}" stroke="${INK}" stroke-width="4"/>
      <path class="ink-stroke" d="M324,382 L436,382" opacity="0.5"/>
      ${label(380, 398, lab || "素材", INK, 22)}
    </g>`,
};

function svg(scene, { lab, w, h }) {
  const draw = scenes[scene] || scenes.idle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40,0 L0,0 0,40" fill="none" stroke="${GRID}" stroke-width="1"/></pattern>
    <style>
      .ink-fill{fill:${INK};}
      .ink-stroke path,.ink-stroke rect,.ink-stroke circle{fill:none;stroke:${INK};stroke-width:4;stroke-linecap:round;stroke-linejoin:round;}
      .ink-stroke{stroke:${INK};stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;}
      .eye{fill:${BOARD};}
      .warn{fill:${ACCENT};}
      .hand{font-family:"Xingkai SC","STKaiti","Kaiti SC","PingFang SC",sans-serif;font-weight:600;}
    </style>
  </defs>
  <rect width="${w}" height="${h}" fill="${BOARD}"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <g filter="url(#rough)">
    ${draw({ lab })}
  </g>
</svg>`;
}

// --- CLI -------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let scene = null, lab = "", out = null, png = false, w = 800, h = 600;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--label") lab = args[++i];
    else if (a === "-o" || a === "--out") out = args[++i];
    else if (a === "--png") png = true;
    else if (a === "--w") w = +args[++i];
    else if (a === "--h") h = +args[++i];
    else if (!scene) scene = a;
  }
  if (!scene) {
    console.error(`usage: node xiaohei-svg.mjs <scene> [--label 文字] [-o out.svg] [--png]`);
    console.error(`scenes: ${Object.keys(scenes).join(" ")}`);
    process.exit(1);
  }
  if (!scenes[scene]) console.error(`⚠ unknown scene "${scene}", falling back to idle`);

  const markup = svg(scene, { lab, w, h });
  const outPath = out || path.join(os.homedir(), "Downloads", `xiaohei-${scene}.svg`);
  fs.writeFileSync(outPath, markup);
  console.error(`✓ SVG: ${outPath}`);

  if (png) {
    let chromium;
    try { ({ chromium } = await import("playwright")); }
    catch { console.error("⚠ --png needs playwright: cd skills/alanhou-wechat && npm install"); process.exit(2); }
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.setContent(`<body style="margin:0">${markup}</body>`);
    const pngPath = outPath.replace(/\.svg$/, ".png");
    await page.locator("svg").screenshot({ path: pngPath });
    await browser.close();
    console.error(`✓ PNG: ${pngPath}`);
  }
}

main().catch((e) => { console.error("✗ " + (e?.stack || e)); process.exit(1); });
