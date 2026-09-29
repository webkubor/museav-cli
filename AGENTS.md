# AGENTS.md

This CLI is designed to be used directly by coding agents (Claude Code, Codex, etc.), not just humans. Read this before shelling out to `museav`.

## What this is

> 定位（2026-09-16 收口，2026-09-28 修订）：**中台 API 客户端 + 一套本地图像后期工具**。
> 两条红线：① 不内置模型运行时 —— 要本地大模型推理就委托外部工具
> （`reverse --local` → `vlm`/mlx-vlm-kit）；② 不寄生第三方工具 ——
> 跟 MUSE AV 中台无关的能力不进这个 CLI。
> 本地图像那套（抠图/超分/去水印/压缩）是例外且**应当留下**：它不重复任何其它仓库，
> museav-mcp 正是把本 CLI 当能力层在用。
>
> **红线 ② 的例外（2026-09-28 owner 定）**：`skillhub` 回来了。
> 它确实不走在中台 API 上，但它是**出站分发**通道——让本地写好的 Agent Skill
> 一条命令发到小红书 SkillHub，不需要用户另外装 CLI、另外学一套命令。
> 3.6.0 移除它的理由是「一次都没用过」（当时 `whoami` 返回 `loggedIn: false`），
> 那是**没被使用的功能，不是错的定位**。红线 ② 拦的是「寄生」，不是「出站」。
>
> `skillhub` 带来的新义务（比「多一个命令」重）：
> 它会把东西发到**别人的平台**上，而 MUSE AV 里有一批平台公共模板。
> 所以它必须带**出站护栏**，见 `src/skillhub-guard.ts`：
> 平台公共模板的正文不得随 Skill 外发，引用 slug 则放行。改这个命令时别把护栏摘掉。

A command-line client for the "studio" image-generation platform (`https://manager.museav.top`). It generates images from a prompt, reverse-engineers a prompt from an existing image, and lists your own generation history. All output is designed for machine consumption: **stdout carries only the final result** (a URL, a prompt string, or JSON); progress and human-readable info goes to stderr.

## Scope: this tool makes *assets*, not finished videos

Know the boundary before you pick a tool:

| You need | Use |
|---|---|
| An image, or a raw video clip from a model | `museav gen` (add `--video`) |
| Cut out a background / upscale / de-watermark / compress | `museav remove-bg` / `upscale` / `remove-watermark` / `compress` |
| **A finished vertical short video** (images + per-shot captions + BGM/voiceover, templated) | **[reel-kit](https://github.com/webkubor/reel-kit)** — `reel make` |

`museav gen --video` gives you a **silent, caption-less clip** — that's raw material, not
something you post. Assembling material into a publishable short is reel-kit's job: its
layouts are HTML/CSS templates, it does voiceover, and **shot length follows the narration**.

> `museav slideshow` existed in 2.9–2.10 and was **retired in 3.0.0** — it duplicated
> reel-kit. The command still exists as a stub that prints migration instructions.
> Don't try to bring it back; use reel-kit.

## Auth: pick one identity, not both

- **You're acting as an individual user** (a person's own account): `museav login` — opens a device-authorization flow (prints a code + URL, polls until the user approves in a browser). Token cached in `~/.museav.json`, valid 7 days.
- **You're acting as a tenant/service** (no human in the loop, e.g. CI, a backend job): set `STUDIO_API_KEY=sk-studio-xxx` as an environment variable, or run `museav config --apiKey sk-studio-xxx`.

Don't try both — whichever credential is present is what gets used (env var `STUDIO_API_KEY` always wins over the config file). If neither is configured, every command exits 1 with a message telling you which one to set up; that error is your signal to either run `login` interactively (if a human is present to approve it) or ask for an apiKey (if not).

## Core commands

```bash
# Generate an image, wait for it, get the URL on stdout
museav gen --prompt 'a poster, neon lights, cyberpunk' --ratio 9:16

# Generate a video (文生视频/图生视频), wait, get the mp4 URL on stdout.
# There is NO --model flag: which model/upstream to use is the PLATFORM's job — smart
# routing is what the middle platform does. Callers supply prompt + ratio + quality only.
# `museav models` / `museav models --video` are read-only lookups of what the platform is
# currently using, not a selection menu.
museav gen --video --prompt 'a cat stretching on a windowsill, cinematic' --ratio 9:16
museav gen --video --image logo.png --prompt 'logo glows slowly, background fades' --ratio 1:1

# Generate from a pre-configured image template instead of a raw prompt (deterministic
# placeholder substitution server-side, no chat cost). List available templates first —
# the output shows which placeholder keys (if any) each template needs.
museav templates
museav gen --template <id> --fields '{"artist":"name","city":"place"}'

# Create a new image template (tenant-apiKey or platform-admin identity only; a personal
# login gets rejected server-side). Ownership is NOT a flag you pass — the server derives it
# from who's calling: a tenant apiKey auto-attaches its own tenant_id (private to that tenant),
# a platform-admin identity creates a tenant_id=null template shared across all tenants.
# Placeholder keys are auto-extracted from {key} in --prompt if --fields is omitted.
museav templates create --name '演唱会海报' --prompt '{artist} 在 {city} 的演唱会海报' --ratio 9:16

# Reverse-engineer a prompt from an existing image (stdout: English prompt only).
# DEFAULT path is the platform API (the doc used to say "local is primary" — that was
# stale; --local has always been an explicit opt-in flag). With --local the CLI shells
# out to `vlm` (mlx-vlm-kit) and falls back to the API with a warning if it's absent.
# Image URLs always go to the API (the local path takes file paths only).
# This READS the image and nothing else — it will NOT build a template. Passing any
# template-ish flag to the underlying API is a hard 400 since 2026-08-16.
museav reverse ./photo.png

# Chain them: regenerate in the same style
museav gen --prompt "$(museav reverse ./photo.png)"

# Turn an image INTO a reusable template (read image + reverse its text layers +
# variabilize + create the template, with the original welded on as its reference
# image). Async by default; stage progress is printed to stderr, template id to stdout.
museav image-to-template ./poster.jpg --name '暗金演唱会主视觉' --variables title,subject,location
museav image-to-template ./poster.jpg --no-create      # dry run: draft JSON on stdout, nothing created

# Upload a file (image/audio/video; type is detected from the bytes, not the extension)
museav upload ./face.png

# Local image tools — no login, no platform quota, work on macOS AND Windows
# (all deps ship prebuilt binaries; zero platform-specific code):
#   compress:  resize/re-encode via sharp. Output <name>-min.<fmt>, never overwrites input.
#   remove-bg: ISNet via onnxruntime-node → alpha PNG (~170MB model auto-downloaded
#              to ~/.museav-models on first use; %USERPROFILE%\.museav-models on Windows).
#   upscale:   Real-ESRGAN via Vulkan GPU → 2M image becomes 10M+ (~65MB engine+model
#              auto-downloaded once to ~/.museav-bin + ~/.museav-models).
#   remove-watermark: pixel-heuristic auto-locate (zero model deps) + LaMa inpainting
#              → clean PNG (~200MB model on-demand, freed after run).
museav compress ./photo.jpg --max-edge 800 --format webp --quality 70
museav remove-bg ./shoe.png              # stdout: path to <name>-nobg.png
museav upscale ./photo.jpg --scale 4     # stdout: path to <name>-4x.png
museav remove-watermark ./poster.jpg     # stdout: path to <name>-clean.png

# List your own (or, if using a tenant apiKey, your tenant's) recent jobs as JSON
museav jobs --limit 10 --status failed

# Tenant-apiKey-only: list the tenant's OWN product catalog / asset library.
# This data does NOT live on the studio platform — it lives on the tenant's own
# backend (a different domain), which this CLI calls directly using the same apiKey.
# Not every tenant has both (or either) endpoint; a 404/401-ish error here means
# that tenant hasn't opened it up, not a bug. Use this to pick a reference image,
# then feed its URL into `gen --template <id> --ref <url>` for "pick a product photo
# + a template" combo generation.
museav products
museav assets


# Check who you're logged in as and whether the account is affiliated with a tenant
# Works for both personal login and apiKey (platform account or tenant). For apiKey:
#   platform-account → 账户: nickname + 邮箱 + 累计出图 + credits
#   tenant          → 租户: tenant_id + name + logo
museav whoami
```

Full flag reference: `museav <command> --help`. Full command table and auth details: see [README.md](./README.md).

## Failure modes worth knowing

- **Cross-platform contract**: the CLI targets macOS AND Windows. No Unix-only assumptions anywhere — paths go through `node:path`/`os.homedir()`, no shell expansions, no brew/which calls in code (OS-specific text adapts via `process.platform`). Keep it that way in new code.
  **本地模型不由 CLI 承担**（2026-09-16 owner 定的分工）：CLI 只调中台 API，要本地推理就
  委托外部工具（`reverse --local` → `vlm`/mlx-vlm-kit）。所以 CLI 自己保持跨平台，
  而某个委托目标是 Apple Silicon 专属并不破坏这条契约 —— 它是 opt-in 且缺失时回落 API。
  不要再往 CLI 里内置第二个模型运行时。
- `gen` polls until the job finishes or times out (default 600s controlled by the underlying `generateAndWait`); a timeout throws, it does not hang forever.
- `jobs --limit`/`--status` are filtered **client-side** — the server always returns your most recent 50 jobs; you cannot page past that.
- Non-zero exit code + a message on stderr is the only failure signal; there's no separate machine-readable error format on stdout.

## Programmatic use (no shell-out)

```ts
import { StudioClient } from 'museav-cli'

const studio = new StudioClient({ baseUrl: 'https://manager.museav.top', apiKey: process.env.STUDIO_API_KEY! })
const job = await studio.generateAndWait({ prompt: 'a cat on the moon', ratio: '3:4' })
console.log(job.cdn_url)
```

## Changelog SOP：先定读者，再动笔（2026-09-29 owner 定）

**第一步永远是「这份日志写给谁看」，不是「这批 commit 改了什么」。**

### 三份日志，三类读者，不要互相串

| 文件 | 版本号 | 读者 | 体例 |
| :--- | :--- | :--- | :--- |
| 本文件 `CHANGELOG.md` | 3.x | 开发者 / 技术租户 | 叙事式「以前…现在…」 |
| `museav-web/src/changelog.js` | v0.x | 普通用户 / 创作者 | emoji 短条目，一件事一条 |
| `museav-manager/public/CHANGELOG.md` | v1.x | 平台管理员（**不是**终端用户） | 平台运维视角 |

2026-09-29 串过一次味：同一批用户侧内容被同时写进 manager 那份 —— 用户看不到、
管理员才会读，只能 revert。**用户侧内容只进本文件。**

### 这份日志的读者是「把 museav 接进自己流程的人」

他关心的是：这条改动让他少写什么、少等多久、报错时能不能看懂。他**不关心**
内部实现，但接受必要的命令、参数、文件路径 —— 这是 CLI 与 C 端的唯一区别：
命令名就是产品本身，藏起来反而没法用。所以 CLI 的日志可以写代码块，
C 端一条都不行。

写每一条时先回答三个问题：

1. **他原来会踩什么坑**？「以前…」那几行必须是真实的痛，不是修辞。
2. **现在他少做了什么 / 多拿到了什么**？
3. **要不要他改用法**？要改就必须给出改前改后的确切命令。

### 口吻

- 简体中文，克制，不营销腔，不堆感叹号。
- 段落式，不是清单式 —— 清单是 C 端的体例。
- 不写：内部服务名、中台接口路径、数据库、部署流水线。
- 修 bug 必须先写「以前会怎样」，否则读者判断不了跟自己有没有关系。
- 一个改动一条，不要把五个功能挤成一段。

### 发版守卫（`.github/workflows/publish.yml` 会拦）

四者必须一致，差一个就红：`CHANGELOG` 顶部版本 == `package.json` 的 `version`
== `git tag` == 冒烟跑出来的 `museav --version`。

**本地 `npm publish` 不算正式发布**：不触发 Actions，租户群收不到通知、
`/api/cli-guide` 的版本号也不会同步。正式发布一律打 `v*` tag。
