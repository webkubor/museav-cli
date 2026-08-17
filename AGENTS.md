# AGENTS.md

This CLI is designed to be used directly by coding agents (Claude Code, Codex, etc.), not just humans. Read this before shelling out to `museav`.

## What this is

A command-line client for the "studio" image-generation platform (`https://manager.museav.top`). It generates images from a prompt, reverse-engineers a prompt from an existing image, and lists your own generation history. All output is designed for machine consumption: **stdout carries only the final result** (a URL, a prompt string, or JSON); progress and human-readable info goes to stderr.

## Auth: pick one identity, not both

- **You're acting as an individual user** (a person's own account): `museav login` — opens a device-authorization flow (prints a code + URL, polls until the user approves in a browser). Token cached in `~/.museav.json`, valid 7 days.
- **You're acting as a tenant/service** (no human in the loop, e.g. CI, a backend job): set `STUDIO_API_KEY=sk-studio-xxx` as an environment variable, or run `museav config --apiKey sk-studio-xxx`.

Don't try both — whichever credential is present is what gets used (env var `STUDIO_API_KEY` always wins over the config file). If neither is configured, every command exits 1 with a message telling you which one to set up; that error is your signal to either run `login` interactively (if a human is present to approve it) or ask for an apiKey (if not).

## Core commands

```bash
# Generate an image, wait for it, get the URL on stdout
museav gen --prompt 'a poster, neon lights, cyberpunk' --ratio 9:16

# Generate a video (文生视频/图生视频), wait, get the mp4 URL on stdout.
# Omit --model to let the platform route automatically (auto); pinning a tier uses
# artsdance-* ids like artsdance-2-0-pro-260801 (Seedance 2.0).
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
# PRIMARY path is LOCAL: Ollama qwen3-vl — fast, free, NO login needed. Falls back to
# the platform API (with a slowness warning) only if Ollama isn't running or the model
# is missing. Image URLs always go to the API (local path takes file paths only);
# --api forces the API path.
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
museav compress ./photo.jpg --max-edge 800 --format webp --quality 70
museav remove-bg ./shoe.png              # stdout: path to <name>-nobg.png

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
# (personal login only — apiKey callers get an error, they're already acting as the tenant)
museav whoami
```

Full flag reference: `museav <command> --help`. Full command table and auth details: see [README.md](./README.md).

## Failure modes worth knowing

- **Cross-platform contract**: the CLI targets macOS AND Windows. No Unix-only assumptions anywhere — paths go through `node:path`/`os.homedir()`, no shell expansions, no brew/which calls in code (OS-specific text like Ollama start hints adapts via `process.platform`). Keep it that way in new code.
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
