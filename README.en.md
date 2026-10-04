[English](./README.en.md) | [中文](./README.md)

<h1 align="center">🎨 museav · CLI for AI Image Generation</h1>

<p align="center">
  <b>Agent-ready</b> — designed to be shelled out to directly, not just used by humans
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Node-%3E%3D18-green?style=for-the-badge" alt="Node">
  <img src="https://img.shields.io/npm/v/%40museav%2Fcli?style=for-the-badge" alt="npm version">
  <img src="https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge" alt="Build">
</p>

---

## Why this instead of something else

| | **museav-cli** | Calling OpenAI/Doubao APIs raw | Playwright/Puppeteer automation | MUSE AV web app |
|---|---|---|---|---|
| **One command from terminal** | ✅ `museav gen "prompt"` | ⚠️ bring your own SDK, signing, retries | ❌ maintain selectors | ❌ open a browser |
| **For agents** | ✅ built to be shelled out to | ⚠️ agent assembles the request itself | ❌ brittle against UI changes | ❌ agents can't use it |
| **Multi-model routing** | ✅ `auto` picks the model | ❌ integrate each provider | — | ✅ |
| **Key management** | ✅ one login command, no secrets in code | ❌ plaintext in your script | — | ✅ browser session |
| **Quota & billing** | ✅ tracked centrally | ❌ your own meter | — | ✅ |
| **Post-processing** (bg removal, upscale, compress) | ✅ built in | ❌ install more tools | — | ✅ web editor |
| **Browser automation workloads** | ❌ can't spawn in edge runtimes | — | ✅ | ✅ |

**In one line**: this CLI solves exactly one problem — **letting humans and agents generate images from a terminal**. For product integration, call the HTTP API or `import { StudioClient }` instead; don't use the CLI.

---

> One line to generate an image. The [MUSE AV platform](https://museav.top) behind it handles models, keys, routing and accounting — you only write the prompt.

`museav` is the command-line client for [MUSE AV](https://museav.top) (formerly "studio"; the API lives at [manager.museav.top](https://manager.museav.top)). Install it, log in (or set an API key), and you can generate, reverse-engineer and image-to-image from your terminal. See [AGENTS.md](./AGENTS.md) for agent-facing usage.

## Is this for you?

**Yes, if** you want to generate an image from a terminal without opening a browser, or you're writing automation, or you're an agent (Claude Code / Codex / Hermes …) asked to produce an image.

**No, if you're building an actual product.** This CLI is for terminals — it is not an SDK or a backend-integration solution. For a real service (e.g. `hym-admin` running on Cloudflare Pages Functions), do one of these instead:

1. Humans need a full UI → embed the [MUSE AV web app](https://museav.top) via SSO (iframe, session syncs automatically)
2. Backend needs programmatic access → `fetch('https://manager.museav.top/api/generate', { headers: { 'X-API-Key': ... } })`, or `import { StudioClient } from 'museav-cli'` as a library

This distinction isn't arbitrary: edge runtimes like Cloudflare Pages Functions/Workers can't spawn subprocesses, so the `museav` binary simply won't run there.

## Install

```bash
npm install -g museav-cli
museav login
museav gen "a Chinese ink-wash mountain at dawn" --ratio 3:4
```

> **Renamed**: package → `museav-cli`, command → `museav`.
> If you had the old package, uninstall it first or you'll have two commands with different names.
> `npm uninstall -g @kubor/studio-cli && npm install -g museav-cli`
> Legacy `~/.museav.json` config and `STUDIO_API_KEY` / `STUDIO_BASE_URL` still work; the new names (`MUSEAV_API_KEY` / `MUSEAV_BASE_URL`) take precedence.

## Commands

| Command | What it does |
|---|---|
| `museav gen "<prompt>"` | Generate an image (text-to-image or image-to-image with `--ref`) |
| `museav gen --video --image a.png --last-frame b.png` | Video from first/last frames (mutually exclusive with the `--reference-*` inputs) |
| `museav gen --video --reference-image a.png --reference-video b.mp4` | Multimodal reference-to-video (images ≤9, videos ≤3, audios ≤3) |
| `museav enhance -p "<rough idea>"` | Enhance a rough idea into a structured video prompt (H3-Context-IR). Enhances only — no video, no generation credits; stdout is the prompt alone |
| `museav gen --video --enhance --prompt "<rough idea>"` | Enhance the prompt first, then submit the video in one go |
| `museav reverse <image>` | Read an image → output an English prompt |
| `museav image-to-template <image>` | Turn an image into a reusable template |
| `museav templates` | List available templates |
| `museav templates create --ref <url>` | Create a template with reference images (1–5) |
| `museav templates publish <id>` | Open a private template to the shared pool (passes a quality gate) |
| `museav templates delete <id>` | Delete your own template |
| `museav remove-bg <file>` | Remove background locally (no login) |
| `museav upscale <file>` | 4x upscale locally (Real-ESRGAN) |
| `museav compress <file>` | Compress a local image |
| `museav skillhub tags` | List the live content tags accepted by Xiaohongshu SkillHub |
| `museav skillhub publish ./my-skill --tag <tag>` | Publish a local Agent Skill to Xiaohongshu SkillHub. Dry-run by default — `--yes` is required to actually submit |

### Publishing Skills to Xiaohongshu SkillHub

`skillhub` is the only outbound channel MUSE AV ships: one CLI gives you both image
generation and a way to distribute the Skills you build. Packing, QR-code authorization,
upload and submission are delegated to the official
[`redskillhub-upload`](https://www.npmjs.com/package/redskillhub-upload) CLI (bundled as a
dependency), so a platform change only ever means bumping a dependency.

```bash
museav skillhub tags                                    # required: there is no default tag
museav skillhub publish ./my-skill --tag 效率工具,编程开发   # dry-run — packs and validates locally
museav skillhub publish ./my-skill --tag 效率工具 --yes    # real submit (QR code via the Xiaohongshu app)
```

**Without `--yes` nothing leaves your machine.** Submission is irreversible — the Skill ID
is the platform's primary key and cannot be renamed across versions.

#### Platform asset guardrail

`skillhub` publishes to *someone else's* platform, and MUSE AV owns a set of public
templates. Every publish is therefore scanned first:

| Situation | Result |
|---|---|
| The Skill embeds a public template's **prompt body** | ❌ Rejected, and it names the offending template |
| The Skill only **references** a template by `slug` | ✅ Allowed — that's normal integration, not redistribution |
| The publish path sits in a platform-managed dir (`~/.museav-models`, `~/.museav-bin`) | ❌ Rejected |

The line is deliberate: copying the body redistributes an asset; citing the slug does not.
Blocking citations too would break museav's own integration Skills.

If the template list can't be fetched (no `museav login`, or the API is unreachable), the CLI
does not silently pretend the guardrail ran — it publishes anyway but says plainly that no
check happened. Log in and re-run to get the full guardrail.

See the [Chinese README](./README.md#把本地-agent-skill-发到小红书-skillhub-skillhub) for the full command surface.

Run `museav <command> --help` for the full surface. For agent integration, read [AGENTS.md](./AGENTS.md).

## Compatible agents

[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-6366f1?style=for-the-badge)](./AGENTS.md)
[![Codex](https://img.shields.io/badge/Codex-compatible-10a37f?style=for-the-badge)](./AGENTS.md)
[![Hermes](https://img.shields.io/badge/Hermes-compatible-f2a65a?style=for-the-badge)](./AGENTS.md)
[![Antigravity](https://img.shields.io/badge/Antigravity-compatible-8b5cf6?style=for-the-badge)](./AGENTS.md)

## License

MIT — see [LICENSE](./LICENSE).
