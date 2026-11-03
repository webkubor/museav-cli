[中文](./README.md) | English

<h1 align="center">
  <img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/mark-v3.svg" width="96" alt="MUSE AV"><br>
  museav · image generation from your terminal
</h1>

<p align="center"><strong>One command to generate. Models, keys, routing and billing are not your problem.</strong></p>

<p align="center">
  <a href="https://www.museav.top"><img src="https://img.shields.io/badge/MUSE%20AV-museav.top-ff6b35?style=for-the-badge" alt="MUSE AV"></a>
  <a href="https://www.npmjs.com/package/museav-cli"><img src="https://img.shields.io/npm/v/museav-cli?style=for-the-badge&color=%23cb3837" alt="npm version"></a>
  <a href="https://docs.museav.top/cli/"><img src="https://img.shields.io/badge/docs-docs.museav.top-4c9a6b?style=for-the-badge" alt="Docs"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/node-%E2%89%A520.19-339933?style=for-the-badge" alt="Node"></a>
</p>

---

## What it produces

Generated with one `museav gen` command — **no English prompt written by hand**:

<a href="https://www.museav.top/discover"><img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/gallery.webp" alt="Discover gallery: work made with museav gen"></a>

<p align="center"><sub>All of these live in the <a href="https://www.museav.top/discover">Discover gallery</a>. Open any of them to see the template and prompt behind it — whatever you like, the CLI can call too.</sub></p>

<img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/terminal.webp" alt="Terminal: real output">

## Why this instead of something else

| | **museav** | Raw OpenAI / Doubao APIs | Playwright on the web app | Web UI only |
|---|---|---|---|---|
| **One command from a terminal** | ✅ `museav gen "prompt"` | ⚠️ manage SDK, signing, retries | ❌ maintain selectors, breaks on redesign | ❌ open a browser |
| **Automatic multi-model routing** | ✅ you just write the prompt | ❌ integrate each provider, fail over by hand | — | ✅ |
| **104 curated Chinese skills** | ✅ expanded server-side, prompts never sent down | ❌ none | — | ✅ |
| **No secrets in your code** | ✅ one login, valid 7 days | ❌ plaintext in your script | — | ✅ browser session |
| **Quota and billing** | ✅ tracked centrally | ❌ your own meter | — | ✅ |
| **Background removal / upscale / de-watermark** | ✅ local, free, no quota | ❌ install more tools | — | ✅ web editor |
| **Callable by an agent** | ✅ stdout is the result only, progress on stderr | ⚠️ agent assembles requests itself | ❌ brittle against UI changes | ❌ agents can't use it |

## 🚀 Quickstart

```bash
npm install -g museav-cli
museav login                                          # approve in the browser
museav gen --skill ecom-main --input "a cream knit sweater"   # stdout: one image URL
```

No account? Sign in with Google / GitHub at [www.museav.top](https://www.museav.top) — open registration.

> Curious what it can do first? Browse the [Discover gallery](https://www.museav.top/discover) — no signup needed.

## 🎯 Three ways to generate, pick one

| Form | When to use it |
| --- | --- |
| `--skill <name> --input "one line"` | **Recommended.** 104 tuned skills; the prompt expands server-side, you write the business description only |
| `--template <id> --fields '{"key":"value"}'` | Deterministic and cheapest. Placeholder substitution, no model call |
| `--prompt "english prompt"` | You write prompts yourself |

```bash
museav skills --genre 电商                      # see what's in a category
museav gen --skill product-on-model --input "a cream knit sweater" --ref ./model.jpg
```

Skills marked "needs a reference image" require `--ref`; local files are uploaded for you.

## 🔥 What else it does

- **🎬 Video** — `museav gen --video`: text-to-video, image-to-video, first/last frame, multimodal references
- **🖼 Reverse-engineer** — `museav reverse ./photo.jpg` reads SCULPT elements back out; chain it into generation
- **🧩 Image to template** — `museav image-to-template ./poster.jpg` reads text layers, variabilizes them, saves a reusable template
- **✂️ Local post-processing, free** — `remove-bg` / `upscale` / `remove-watermark` / `compress`: no login, no quota, works on Windows
- **🏪 Sell your own work** — `museav shop` for products, wallpaper issues and claim codes
- **🤖 Built for agents** — stdout carries only the final result (URL / JSON), progress goes to stderr

## 📚 Documentation

**This page covers "why" and "how to start". Every command and flag lives on the docs site, which tracks the published version and doesn't go stale.**

| What you want | Where |
| --- | --- |
| Install, three identities, where credentials live | [Install and log in](https://docs.museav.top/cli/) |
| Every command in one table | [Command reference](https://docs.museav.top/cli/commands) |
| Recipes: reference images, batches, aspect ratios | [Recipes](https://docs.museav.top/cli/recipes) |
| First/last frame, references, IP subjects, local tools | [Video and local tools](https://docs.museav.top/cli/advanced) |
| Products, wallpaper issues, claim codes | [Running your shop](https://docs.museav.top/cli/shop) |
| Let Claude Code / Codex drive it | [For agents](https://docs.museav.top/cli/agent) · [AGENTS.md](./AGENTS.md) |
| Wire generation, video and SkillHub into one service | [MCP](https://docs.museav.top/cli/mcp) |
| HTTP API, backend integration | [API overview](https://docs.museav.top/api/) |

<a href="https://docs.museav.top/cli/"><img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/docs.webp" alt="Documentation site"></a>

## 🧭 Where not to use it

**This CLI is for "a human in a terminal" and "an agent shelling out".**

Don't build a product on it: edge runtimes like Cloudflare Workers / Pages Functions **cannot spawn subprocesses**,
so the `museav` binary simply won't run there. Two alternatives:

- Programmatic backend calls → `fetch('https://manager.museav.top/api/generate', { headers: { 'X-API-Key': ... } })`
- Use it as a library → `import { StudioClient } from 'museav-cli'`

```ts
import { StudioClient } from 'museav-cli'

const studio = new StudioClient({ baseUrl: 'https://manager.museav.top', apiKey: process.env.MUSEAV_API_KEY! })
const job = await studio.generateAndWait({ prompt: 'a cat on the moon', ratio: '3:4' })
console.log(job.cdn_url)
```

**Nor does it produce finished vertical videos.** `gen --video` gives you silent, caption-less raw footage;
assembling that into something publishable is [reel-kit](https://github.com/webkubor/reel-kit)'s job.

Typical chain: `museav gen` → `museav remove-bg` → `reel make`.

## 🤝 Compatible agents

[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-6366f1?style=for-the-badge)](./AGENTS.md)
[![Codex](https://img.shields.io/badge/Codex-compatible-10a37f?style=for-the-badge)](./AGENTS.md)
[![Hermes](https://img.shields.io/badge/Hermes-compatible-f2a65a?style=for-the-badge)](./AGENTS.md)
[![Antigravity](https://img.shields.io/badge/Antigravity-compatible-8b5cf6?style=for-the-badge)](./AGENTS.md)

No wizard menus, no `y/N` prompts, only parseable output on stdout, credentials via environment variables.
See [AGENTS.md](./AGENTS.md).

## 📦 Migrating from the old package

```bash
npm uninstall -g @kubor/studio-cli   # otherwise both commands coexist
npm install -g museav-cli            # new package, command is `museav`
```

- Replace the old command with `museav xxx` in scripts — flags and behaviour are identical
- The legacy `~/.studio-cli.json` config **is still read**, so no re-login needed
- `STUDIO_API_KEY` / `STUDIO_BASE_URL` still work; `MUSEAV_API_KEY` / `MUSEAV_BASE_URL` take precedence
- As a library: `import { StudioClient } from 'museav-cli'` (class name unchanged)

## 🔧 Releasing (maintainers)

CI owns releases — never `npm publish` locally. Push a `v*` tag to trigger
`.gitlab-ci.yml` (Trusted Publishing via OIDC; no NPM_TOKEN, no OTP).

These four must match: `CHANGELOG` top version == `package.json` `version` == `git tag` == `museav --version`.

## License

[MIT](./LICENSE)

---

<p align="center"><sub>Platform <a href="https://www.museav.top">MUSE AV</a> · API <a href="https://manager.museav.top">manager.museav.top</a> · Docs <a href="https://docs.museav.top">docs.museav.top</a></sub></p>
