# AGENTS.md

This CLI is designed to be used directly by coding agents (Claude Code, Codex, etc.), not just humans. Read this before shelling out to `studio-cli`.

## What this is

A command-line client for the "studio" image-generation platform (`https://studio.webkubor.online`). It generates images from a prompt, reverse-engineers a prompt from an existing image, and lists your own generation history. All output is designed for machine consumption: **stdout carries only the final result** (a URL, a prompt string, or JSON); progress and human-readable info goes to stderr.

## Auth: pick one identity, not both

- **You're acting as an individual user** (a person's own account): `studio-cli login` — opens a device-authorization flow (prints a code + URL, polls until the user approves in a browser). Token cached in `~/.studio-cli.json`, valid 7 days.
- **You're acting as a tenant/service** (no human in the loop, e.g. CI, a backend job): set `STUDIO_API_KEY=sk-studio-xxx` as an environment variable, or run `studio-cli config --apiKey sk-studio-xxx`.

Don't try both — whichever credential is present is what gets used (env var `STUDIO_API_KEY` always wins over the config file). If neither is configured, every command exits 1 with a message telling you which one to set up; that error is your signal to either run `login` interactively (if a human is present to approve it) or ask for an apiKey (if not).

## Core commands

```bash
# Generate an image, wait for it, get the URL on stdout
studio-cli gen --prompt 'a poster, neon lights, cyberpunk' --ratio 9:16

# Reverse-engineer a prompt from an existing image (stdout: English prompt only)
studio-cli reverse ./photo.png

# Chain them: regenerate in the same style
studio-cli gen --prompt "$(studio-cli reverse ./photo.png)"

# List your own (or, if using a tenant apiKey, your tenant's) recent jobs as JSON
studio-cli jobs --limit 10 --status failed

# Check who you're logged in as and whether the account is affiliated with a tenant
# (personal login only — apiKey callers get an error, they're already acting as the tenant)
studio-cli whoami
```

Full flag reference: `studio-cli <command> --help`. Full command table and auth details: see [README.md](./README.md).

## Failure modes worth knowing

- `gen` polls until the job finishes or times out (default 600s controlled by the underlying `generateAndWait`); a timeout throws, it does not hang forever.
- `jobs --limit`/`--status` are filtered **client-side** — the server always returns your most recent 50 jobs; you cannot page past that.
- Non-zero exit code + a message on stderr is the only failure signal; there's no separate machine-readable error format on stdout.

## Programmatic use (no shell-out)

```ts
import { StudioClient } from '@webkubor/studio-cli'

const studio = new StudioClient({ baseUrl: 'https://studio.webkubor.online', apiKey: process.env.STUDIO_API_KEY! })
const job = await studio.generateAndWait({ prompt: 'a cat on the moon', ratio: '3:4' })
console.log(job.cdn_url)
```
