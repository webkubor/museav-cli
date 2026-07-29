# Changelog

## 0.3.0

- `jobs`: query your own (or your tenant's) recent image-generation history. `--limit`/`--status` are filtered client-side — the server always returns the 50 most recent jobs, no pagination.
- Fixed a bug where `gen` (and the new `jobs`) would crash before ever calling the API: the `withClient` wrapper dropped the `options` object for any command with flags but no positional argument.

## 0.2.0

- `login`/`logout`: device-authorization flow for individual platform users — no need to request a tenant apiKey just to generate images from your own account.
- Config file (`~/.studio-image.json`) now stored with `0600` permissions (it can hold a personal login token, not just a tenant apiKey).

## 0.1.0

- Initial release: `gen`, `reverse`, `upload`, `models`, `balance`, `config` — a CLI client for the studio image-generation platform, authenticated via tenant apiKey.
