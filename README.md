# alanhou-skills

Personal agent skills, usable from Claude Code, OpenAI Codex CLI, and Gemini CLI.
All three tools support the same [Agent Skills](https://agentskills.io) standard:
a skill is a directory containing a `SKILL.md` with `name` + `description` frontmatter,
plus optional `references/`, `scripts/`, and `assets/`.

## Skills

| Skill | What it does | Derived from | License | Extra deps |
|-------|--------------|--------------|---------|------------|
| `alanhou-ppt` | Single-file HTML horizontal swipe decks (electronic-magazine or Swiss style), WebGL backgrounds, validated layouts | [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) | AGPL-3.0 | none |
| `alanhou-social-card` | Xiaohongshu 3:4 card sets + WeChat 21:9 / 1:1 cover pairs in the same style system | [guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill) | AGPL-3.0 | Playwright (validation) |
| `alanhou-card` | "铸" content caster — turns any content into PNG visuals (long card, infograph, sketchnote, comic, whiteboard, big-font card) | [ljg-card](https://github.com/lijigang/ljg-skills) | MIT | Node + Playwright |
| `alanhou-paper` | Retells an academic paper as a seven-beat story for non-academics | [ljg-paper](https://github.com/lijigang/ljg-skills) | MIT | none |
| `alanhou-writes` | Writing engine — dissects one opinion into a 1000-1500 word essay | [ljg-writes](https://github.com/lijigang/ljg-skills) | MIT | none |
| `alanhou-video-fetch` | Video link → clean transcript (YouTube / bilibili / xiaohongshu / douyin); feeds alanhou-writes / card / ppt | original | MIT | yt-dlp + ffmpeg; whisper for no-sub videos |

### One-time dependencies (alanhou-card / alanhou-social-card)

```bash
cd skills/alanhou-card && npm install && npx playwright install chromium
cd skills/alanhou-social-card && npm install
```

## Credits & licensing

Skills here are adapted and rebranded from upstream open-source work, with attribution
notices kept in each `SKILL.md`. The two guizang-derived skills retain their upstream
**AGPL-3.0** license (a `LICENSE` copy sits inside each skill directory) — if this repo
is published, those two skills remain AGPL-3.0. The ljg-derived skills are MIT.

## Layout

```
alanhou-skills/
├── skills/
│   ├── skill-template/     # copy this to start a new skill (never installed)
│   │   ├── SKILL.md        # required: frontmatter + workflow
│   │   ├── references/     # deep docs, loaded on demand (progressive disclosure)
│   │   ├── scripts/        # deterministic helpers (validators, converters)
│   │   ├── assets/         # templates the skill copies/fills in
│   │   └── agents/openai.yaml  # optional Codex UI metadata
│   └── <your-skill>/
├── scripts/install.sh      # symlinks skills into all three CLIs
└── .claude-plugin/plugin.json  # makes the repo installable as a Claude Code plugin
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
npx skills add alanhou/alanhou-skills -g --all        # all skills
npx skills add alanhou/alanhou-skills -g --skill foo  # one skill
```

## Creating a new skill

1. `cp -r skills/skill-template skills/my-skill`
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
