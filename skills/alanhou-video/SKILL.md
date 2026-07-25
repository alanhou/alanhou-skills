---
name: alanhou-video
description: "Create short animated videos (MP4) from single-file HTML scenes, rendered locally with Playwright + ffmpeg. Six built-in frame styles: glitch title (cyberpunk), liquid aurora hero, light-leak cinematic, NYT-style animated data chart, typewriter terminal text, logo outro. Supports two render profiles (preview for fast iteration, final for release), scene-level caching, automatic audio muxing, and post-render verification. Use when the user asks to 做视频 / 做个片头 / 生成 MP4 / video intro / title card / animated chart video / 转场 / outro, or wants article/deck content turned into a short video. Not for: long-form editing, talking-head video, or fetching existing videos (use alanhou-video-fetch for that)."
user_invocable: true
version: "0.2.0"
---

# alanhou-video

<!-- attribution: render pipeline and bundled templates ported from nexu-io/html-video (Apache-2.0); some upstream templates derive from heygen-com/hyperframes (Apache-2.0). Keep notices in scripts/ and assets/templates/. -->

写若干个单文件 HTML 动画场景，本机渲染成一个 MP4。HTML 即视频：能用 CSS/JS 表达的画面都能变成片子。

## 工作流

### Step 1 · 需求澄清

问清（或基于内容合理默认并说明）：

1. **内容来源**：主题 / 文章 / 文字稿（视频链接先走 alanhou-video-fetch 取文字稿）
2. **时长与场景数**：默认 3-5 个场景、总长 15-30 秒；单场景片头 5 秒左右
3. **风格**：从模板目录挑（见 Step 2），或按内容推荐
4. **比例**：默认 1920x1080（16:9）；竖屏 1080x1920 需在场景 HTML 里同步改版式

### Step 2 · 挑场景模板

读 `references/templates.md` 选型。六个内置模板（`assets/templates/`）：

| 模板 | 风格 | 适合 |
|------|------|------|
| `glitch-title.html` | 故障艺术 / cyberpunk | 片头、转场、"system online" |
| `liquid-hero.html` | 极光流体渐变 | 产品亮相、大声明 |
| `light-leak-cinema.html` | 暖调胶片漏光 | 情绪片段、品牌片、年度回顾 |
| `data-chart-nyt.html` | 报纸风动画折线图 | "数字涨了"的故事 |
| `text-cursor.html` | 终端打字机 | 代码 / CLI 演示、逐字揭示 |
| `logo-outro.html` | 干净 logo 收尾 | 任何片子的结尾页 |

每个场景：**拷贝模板 → 替换为真实内容 → 保持视觉签名**。不要 lorem ipsum，不要占位图。写新场景或大改动画前必读 `references/authoring.md`（时长探测规则、字体、循环动画的写法都在里面）。

### Step 3 · 渲染

```bash
cd <SKILL_ROOT>
node scripts/render.mjs -o ~/Downloads/out.mp4 scene1.html scene2.html scene3.html
```

#### 两档渲染策略

**开发迭代用 preview，确认后再出 final。** 不要每次小修改都跑 final。

```bash
# 快速预览（960p / 24fps / ultrafast / CRF 28）—— 迭代文案和动画
node scripts/render.mjs -p preview -o ~/Downloads/out.mp4 scene1.html scene2.html

# 正式成片（原始分辨率 / 30fps / medium / CRF 20）—— 最终交付
node scripts/render.mjs -p final -o ~/Downloads/out.mp4 scene1.html scene2.html
```

| 档位 | 分辨率 | 帧率 | 编码速度 | 画质 | 用途 |
|------|--------|------|----------|------|------|
| `preview` | 长边最大 960 | 最高 24 | ultrafast | CRF 28 | 快速看内容、排版、节奏 |
| `final` | 保持原始 | 保持原始 | medium | CRF 20 | 公开发布、交付 |

不传 `-p` 默认为 `final`，向后兼容。

#### 场景级缓存

渲染器按 HTML 文件内容 + 渲染参数生成缓存键。如果场景 HTML 没有改动，再次渲染时直接复用上次结果，跳过 Playwright 录制。缓存存储在 `<SKILL_ROOT>/.cache/scenes/`。

- 修改了场景 HTML → 自动 cache miss，重新录制
- 只改了其他场景 → 未变场景 cache hit
- 调试时可用 `--no-cache` 强制重新渲染

#### 音频合流

```bash
# 配背景音乐
node scripts/render.mjs -o ~/Downloads/out.mp4 -a bgm.mp3 scene1.html scene2.html

# 配旁白
node scripts/render.mjs -o ~/Downloads/out.mp4 --audio narration.m4a scene1.html
```

音频自动编码为 AAC 192kbps，以 `-shortest` 裁剪到视频时长。支持 mp3、m4a、wav、aac 等 ffmpeg 可解码格式。

#### 其他选项

- `-d 5` 强制每场景精确 5 秒（不足时定格补齐），默认 `auto` 按动画实际长度
- `-s 1080x1920` 竖屏；`-f 60` 高帧率
- 依赖：本目录 `npm install && npx playwright install chromium`，以及 `ffmpeg`（`brew install ffmpeg`）
- 模板用了 Tailwind CDN 和 Google Fonts，渲染机器需要网络；字体加载有 8 秒上限兜底

### Step 4 · 验证

渲染完成后会自动输出 JSON 验证报告，包括：

```json
{
  "status": "ok",
  "file": "/Users/.../out.mp4",
  "profile": "final",
  "scenes": 3,
  "sceneDurations": [5.0, 5.0, 3.0],
  "expectedDuration": 13.0,
  "actualDuration": 13.02,
  "resolution": "1920x1080",
  "codec": "h264",
  "pixFmt": "yuv420p",
  "fps": 30,
  "fileSize": "2.1 MB",
  "audio": "bgm.mp3",
  "renderTimeSeconds": 12.3,
  "cache": "enabled",
  "errors": []
}
```

- `status: "ok"` 表示通过全部检查
- `status: "warning"` 表示有非致命问题（如时长偏差 > 1 秒），详见 `errors` 数组
- `status: "error"` 表示 ffprobe 无法读取输出文件

不再需要手动跑 `ffprobe`。如果报告中 `errors` 非空，先检查：动画是否全写成了 `infinite`、场景 HTML 是否有语法错误、ffmpeg 是否为完整版。

## 运行环境适配

- **Claude Code / Codex / Gemini CLI**：全部走 shell 执行 `render.mjs`，无平台专用依赖。
- 场景 HTML 放在用户项目或输出目录里，不要写进 skill 目录。
- 缓存目录 `.cache/` 是 skill 内部产物，不要提交到版本控制。

## 约束

- 不做长视频剪辑、不处理真人素材；取网络视频文字稿用 alanhou-video-fetch
- 单场景渲染上限 30 秒，更长的内容拆场景
