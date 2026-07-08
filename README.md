# alanhou-skills

Personal agent skills, usable from Claude Code, OpenAI Codex CLI, Gemini CLI, and Antigravity (`agy`).
All three tools support the same [Agent Skills](https://agentskills.io) standard:
a skill is a directory containing a `SKILL.md` with `name` + `description` frontmatter,
plus optional `references/`, `scripts/`, and `assets/`.

## Skills

| Skill | What it does | Derived from | License | Extra deps |
|-------|--------------|--------------|---------|------------|
| `alanhou-ppt` | Single-file HTML horizontal swipe decks (electronic-magazine or Swiss style), WebGL backgrounds, validated layouts | [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) | AGPL-3.0 | none |
| `alanhou-social-card` | Xiaohongshu 3:4 card sets + WeChat 21:9 / 1:1 cover pairs in the same style system | [guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill) | AGPL-3.0 | Playwright (validation) |
| `alanhou-illustration` | Labeled material illustrations (带字解释图), chart beautify from screenshots/data, reference-informed concept visuals — the "middle image" that goes inside cards/PPT/articles; outputs image-gen prompt plans + images when an image tool is available | [guizang-material-illustration](https://github.com/op7418/guizang-material-illustration) | AGPL-3.0 | `OPENAI_API_KEY` and/or `GEMINI_API_KEY` for bundled generate-image.mjs (custom endpoints via `OPENAI_BASE_URL` / `GEMINI_BASE_URL`); prompt plans work without any key |
| `alanhou-card` | "铸" content caster — turns any content into PNG visuals (long card, infograph, sketchnote, comic, whiteboard, big-font card) | [ljg-card](https://github.com/lijigang/ljg-skills) | MIT | Node + Playwright |
| `alanhou-paper` | Retells an academic paper as a seven-beat story for non-academics | [ljg-paper](https://github.com/lijigang/ljg-skills) | MIT | none |
| `alanhou-writes` | Writing engine — dissects one opinion into a 1000-1500 word essay | [ljg-writes](https://github.com/lijigang/ljg-skills) | MIT | none |
| `alanhou-wechat` | WeChat 公众号 writer — hook title (4-5 candidates) + scannable mobile layout + golden quotes + CTA ending; 小黑 IP 配图 drawn as SVG (7 scenes); optional Chrome-CDP draft publishing (no API keys) | title & 排版 ideas from [baoyu-skills](https://github.com/JimLiu/baoyu-skills) | MIT | none to write; Playwright only for 配图 PNG / publishing |
| `alanhou-wechat-layout` | WeChat 公众号 layout engine — Markdown/docx/PDF → themed inline-styled HTML that pastes into the 公众号 editor without losing styles; 6 theme component libraries + theme generator (from description or reference image), auto chapter numbering, per-paragraph keyword underlines, dual lint/validate scripts, copy-button preview page | [gzh-design-skill](https://github.com/isjiamu/gzh-design-skill) by 甲木 × 摸鱼小李 | AGPL-3.0 | python3 (validators) |
| `alanhou-video-fetch` | Video link → clean transcript (YouTube / bilibili / xiaohongshu / douyin); feeds alanhou-writes / card / ppt | original | MIT | yt-dlp + ffmpeg; whisper for no-sub videos |
| `alanhou-book` | 拆书 — deconstructs a book (问题/零点/位移/落点/行囊) + ASCII cognitive map; grounds on web or local EPUB/PDF | [ljg-book](https://github.com/lijigang/ljg-skills) | MIT | none (pdftotext for PDFs outside Claude Code) |
| `alanhou-video` | Animated MP4s from single-file HTML scenes (glitch / aurora / cinematic / data-chart / typewriter / outro) | render pipeline + templates from [nexu-io/html-video](https://github.com/nexu-io/html-video) | Apache-2.0 | Node + Playwright + ffmpeg |

### One-time dependencies (alanhou-card / alanhou-social-card)

```bash
cd skills/alanhou-card && npm install && npx playwright install chromium
cd skills/alanhou-social-card && npm install
cd skills/alanhou-video && npm install && npx playwright install chromium
# alanhou-wechat: only for optional extras — 小黑 SVG→PNG 配图 + Chrome-CDP publishing (writing needs nothing)
cd skills/alanhou-wechat && npm install && npx playwright install chromium  # chromium only needed for --png
```

## Credits & licensing

Skills here are adapted and rebranded from upstream open-source work, with attribution
notices kept in each `SKILL.md`. The three guizang-derived skills and `alanhou-wechat-layout`
(from gzh-design-skill) retain their upstream **AGPL-3.0** license (a `LICENSE` copy sits
inside each skill directory) — if this repo is published, those four skills remain
AGPL-3.0. The ljg-derived skills are MIT.

## Layout

```
alanhou-skills/
├── skills/<your-skill>/    # one directory per skill
│   ├── SKILL.md            # required: frontmatter + workflow
│   ├── references/         # deep docs, loaded on demand (progressive disclosure)
│   ├── scripts/            # deterministic helpers (validators, converters)
│   ├── assets/             # templates the skill copies/fills in
│   └── agents/openai.yaml  # optional Codex UI metadata
├── skill-template/         # copy into skills/ to start a new skill (ships TEMPLATE.md, not SKILL.md, so installers skip it)
├── scripts/install.sh      # symlinks skills into all three CLIs
└── .claude-plugin/
    ├── plugin.json       # makes the repo installable as a Claude Code plugin
    └── marketplace.json  # makes the repo installable in Antigravity (agy) — lists all skills
```

## Install (local development)

```bash
./scripts/install.sh
```

This symlinks every skill into `~/.claude/skills/` (Claude Code) and
`~/.agents/skills/` (Codex CLI and Gemini CLI both scan this shared location).
Because they are symlinks, editing or pulling this repo updates all CLIs at once.

## Install (from GitHub, once published)

```bash
# all skills, into the three CLIs this repo targets
npx skills add alanhou/alanhou-skills -g -s '*' -a claude-code -a codex -a gemini-cli -y

# one skill
npx skills add alanhou/alanhou-skills -g -s alanhou-card -a claude-code -a codex -a gemini-cli -y
```

Don't use `--all`: it expands to `--agent '*'` (every agent the CLI knows), and
agents that lack global-install support (e.g. PromptScript) abort the run with
"does not support global skill installation". Name agents explicitly with
repeated `-a` flags (comma-separated lists are not parsed).

## Install (Antigravity CLI `agy`)

`agy` doesn't scan `~/.claude/skills` or `~/.agents/skills`; it uses a plugin
marketplace. This repo ships `.claude-plugin/marketplace.json` (one plugin
exposing all skills), so inside an `agy` session:

```text
/plugin marketplace add alanhou/alanhou-skills
/plugin install alanhou-skills@alanhou-skills
```

Or from a local clone, point `agy` at the repo root (it reads the marketplace
manifest and registers every skill):

```bash
agy plugin install ./        # run from the repo root
agy plugin list              # confirm: imports → alanhou-skills, components: [skills]
```

## Creating a new skill

1. `cp -r skill-template skills/my-skill && mv skills/my-skill/TEMPLATE.md skills/my-skill/SKILL.md`
2. Edit `SKILL.md`: set `name: my-skill` (must match the directory), write the
   description with explicit trigger phrases — the description is the only thing
   the model sees before deciding to use the skill.
3. Delete unused folders; keep `SKILL.md` under ~500 lines, push detail to `references/`.
4. `./scripts/install.sh`, restart the CLI, test the trigger phrase in all three tools.

## Per-CLI notes

| CLI | Skill location | Trigger | Notes |
|-----|----------------|---------|-------|
| Claude Code | `~/.claude/skills/` | automatic, or `/my-skill` | also installable as plugin via `.claude-plugin/` |
| Codex CLI | `~/.agents/skills/` | automatic, or `$my-skill` / `/skills` | optional `agents/openai.yaml` for UI metadata |
| Gemini CLI | `~/.agents/skills/` (alias of `~/.gemini/skills/`) | automatic; `/skills list` to inspect | needs v0.26+; asks permission on activation |
| Antigravity (`agy`) | plugin store (not a skills dir) | automatic once installed | install via marketplace, not the symlinks — see "Install (Antigravity CLI)". `agy` resolves a plugin's skills from `marketplace.json`, so `.claude-plugin/marketplace.json` is required (a bare `plugin.json` is not enough) |
