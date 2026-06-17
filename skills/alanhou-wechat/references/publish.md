# 发布到公众号（可选 · Path B · Chrome CDP）

**可选**功能。写作是本 skill 的本体；这一步只是把写好的 Markdown 灌进公众号编辑器，省掉手动复制粘贴。不需要 AppID / AppSecret，不需要服务号认证，**个人订阅号也能用**——因为它走的是你已登录的浏览器，不是 API。

为什么不用官方 API：草稿/发布 API 只对**认证服务号**开放，且要求**IP 白名单**，个人订阅号根本拿不到权限。所以这里走浏览器自动化。

## 分工

| 谁 | 做什么 | 为什么 |
|----|--------|--------|
| **你（人）** | ① 带远程调试启动 Chrome ② 登录 mp.weixin.qq.com（扫码）③ 新建文章打开编辑器 | 登录、扫码、过验证——脚本碰不了 |
| **脚本** | 连上那个编辑器标签页，填标题/作者，把正文粘进去，留成草稿 | 机械、易错的体力活 |

脚本**永远不发表**。它只填草稿，配图和「发表」由你在浏览器里手动完成。

## 步骤

### 1. 装依赖（一次性）

```bash
cd skills/alanhou-wechat && npm install
```

（只需 `playwright` 的 JS 包即可连接已有 Chrome；不必 `playwright install chromium`，因为用的是你自己的 Chrome。）

### 2. 带远程调试启动 Chrome

用一个独立的 user-data-dir，别动你日常的 Chrome：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.wechat-chrome"
```

### 3. 登录并打开编辑器

在这个 Chrome 里：

1. 打开 https://mp.weixin.qq.com ，扫码登录
2. **新的创作 → 文章**，让编辑器（有标题框 + 正文区）停在前台

### 4. 跑脚本

```bash
node scripts/publish-wechat.mjs ~/Documents/notes/20260617-标题关键词.md --port 9222
# 想顺手点「保存为草稿」：加 --save-draft
```

脚本会：找到编辑器标签页 → 填标题/作者 → 把正文作为一次粘贴事件灌进去（ProseMirror/UEditor 都吃 paste）→ 截图存到 skill 目录方便核对。

### 5. 你来收尾

回到 Chrome：在 `配图` 占位处插入图片（封面交 `alanhou-social-card`，文中长图交 `alanhou-card`），核对排版，点**发表**。

## 只要 HTML、不要自动化？

不想开浏览器，只想要一段能直接粘进编辑器的带样式 HTML：

```bash
node scripts/md-to-wechat-html.mjs article.md -o article.html
```

公众号编辑器会保留内联样式（class 和 `<style>` 会被剥掉，所以脚本把样式全内联了）。打开 `article.html`、全选复制、粘进编辑器即可。

## 排障

- **连不上**：确认第 2 步的 Chrome 还开着，端口对得上（默认 9222）。
- **找不到编辑器标签页**：确认第 3 步的文章编辑器在那个被调试的 Chrome 里、且已打开（不是另一个普通 Chrome 窗口）。
- **标题/正文没进去**：公众号 DOM 会变。脚本会打印它匹配到的选择器；如果某个 `⚠ 未找到`，对应字段手动填，并到 `scripts/publish-wechat.mjs` 顶部的 `TITLE_SEL` / `BODY_SEL` 里补一个当前的选择器。
