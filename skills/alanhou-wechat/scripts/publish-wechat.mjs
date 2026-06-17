#!/usr/bin/env node
/*
 * publish-wechat.mjs — fill an already-open WeChat 公众号 article editor with
 * this skill's Markdown, via Chrome DevTools Protocol (no API keys).
 *
 * Division of labor (the human does the fragile parts, the script the tedious):
 *   YOU:    1. launch Chrome with remote debugging:
 *              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *                --remote-debugging-port=9222 --user-data-dir="$HOME/.wechat-chrome"
 *           2. log into https://mp.weixin.qq.com (scan QR)
 *           3. open a new article editor: 新的创作 → 文章
 *   SCRIPT: connect, find that editor tab, set title/author, paste the body,
 *           leave it as a draft for you to review images + publish.
 *
 *   node publish-wechat.mjs <article.md> [--port 9222] [--save-draft]
 *
 * --save-draft  attempt to click 保存为草稿 after filling (off by default —
 *               the script never publishes; you click 发表 yourself).
 *
 * Best-effort: WeChat's editor DOM drifts. The script tries several selectors,
 * logs what it matched, and screenshots the result so you can verify.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mdToWechatHtml } from "./md-to-wechat-html.mjs";

const args = process.argv.slice(2);
let file = null, port = 9222, saveDraft = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port") port = +args[++i];
  else if (args[i] === "--save-draft") saveDraft = true;
  else if (!file) file = args[i];
}
if (!file) { console.error("usage: node publish-wechat.mjs <article.md> [--port 9222] [--save-draft]"); process.exit(1); }

const { html, title, author } = mdToWechatHtml(fs.readFileSync(file, "utf8"));
const here = path.dirname(fileURLToPath(import.meta.url));

const TITLE_SEL = ["#title", "textarea[placeholder*='标题']", ".js_title", "input[placeholder*='标题']"];
const AUTHOR_SEL = ["#author", "input[placeholder*='作者']", ".js_author"];
const BODY_SEL = [".ProseMirror", ".rich_media_content .ProseMirror", "#ueditor_0", "[contenteditable='true']"];

async function fillField(page, selectors, value) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (!el) continue;
    try {
      await el.click();
      await page.evaluate(({ s, v }) => {
        const node = document.querySelector(s);
        const setter = Object.getOwnPropertyDescriptor(node.__proto__, "value")?.set;
        if (setter) setter.call(node, v); else node.value = v;
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      }, { s: sel, v: value });
      return sel;
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch (e) {
    console.error(`✗ Could not connect to Chrome on port ${port}.`);
    console.error(`  Launch Chrome first:`);
    console.error(`  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=${port} --user-data-dir="$HOME/.wechat-chrome"`);
    process.exit(2);
  }

  // find the editor tab among all open pages
  const pages = [];
  for (const ctx of browser.contexts()) pages.push(...ctx.pages());
  let page = null, matchedBody = null;
  for (const p of pages) {
    for (const sel of BODY_SEL) {
      if (await p.$(sel)) { page = p; matchedBody = sel; break; }
    }
    if (page) break;
  }

  if (!page) {
    console.error("✗ No WeChat article editor found among open tabs.");
    console.error("  In your debugged Chrome: log into mp.weixin.qq.com, then 新的创作 → 文章,");
    console.error("  so the editor (with a title field + body area) is open. Then re-run.");
    await browser.close();
    process.exit(3);
  }
  console.error(`✓ Found editor tab: ${page.url()}`);
  console.error(`  body editor matched: ${matchedBody}`);

  // title + author
  if (title) {
    const s = await fillField(page, TITLE_SEL, title);
    console.error(s ? `✓ title set (${s}): ${title}` : `⚠ title field not found — set it manually`);
  }
  if (author) {
    const s = await fillField(page, AUTHOR_SEL, author);
    console.error(s ? `✓ author set (${s}): ${author}` : `⚠ author field not found — set it manually`);
  }

  // paste body as a synthetic paste event (ProseMirror/UEditor handle paste)
  const plain = html.replace(/<[^>]+>/g, "");
  const pasted = await page.evaluate(({ sel, h, t }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.focus();
    try {
      const dt = new DataTransfer();
      dt.setData("text/html", h);
      dt.setData("text/plain", t);
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return true;
    } catch (e) { return String(e); }
  }, { sel: matchedBody, h: html, t: plain });
  console.error(pasted === true ? "✓ body pasted into editor" : `⚠ body paste failed: ${pasted} — paste the HTML manually`);

  await page.waitForTimeout(1500);

  if (saveDraft) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("a,button,span")].find((b) => /保存为草稿|保存草稿/.test(b.textContent || ""));
      if (btn) { btn.click(); return btn.textContent.trim(); }
      return null;
    });
    console.error(clicked ? `✓ clicked: ${clicked}` : "⚠ 保存为草稿 button not found — save manually");
    await page.waitForTimeout(1500);
  }

  const shot = path.join(here, "..", `wechat-editor-${Date.now()}.png`);
  try { await page.screenshot({ path: shot, fullPage: false }); console.error(`✓ screenshot: ${shot}`); } catch {}

  console.error("\nNext: review the draft in Chrome — insert images at the 配图 placeholders, then click 发表 yourself.");
  console.error("(This script never publishes.)");

  // connectOverCDP: do NOT close — leave the user's Chrome running
  browser.contexts(); // keep ref
  process.exit(0);
}

main().catch((e) => { console.error("✗ " + (e?.stack || e)); process.exit(1); });
