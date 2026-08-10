# Changelog

## 1.3.0

- 新增 `templates create`：命令行直接建图片模板，不用再依赖网页后台。归属不是自己传的参数——服务端根据调用身份自动决定：租户 apiKey 建的自动归该租户（其他租户看不到），平台管理员账号建的是 `tenant_id` 为空的平台共享模板，个人登录会被拒绝。不传 `--fields` 时会自动从 `--prompt` 里的 `{key}` 占位符提取字段。
- 修复：`templates create --category <x>` 的值被静默吞掉——父命令 `templates` 也声明了同名的 `--category`（列表过滤用），commander 会在分发到 `create` 子命令之前把这个参数值算到父命令头上。用 `program.enablePositionalOptions()` 修复。
- 新增 `products` / `assets`：查所属租户自己的产品目录 / 素材库，数据在租户自己的后台（不在 studio 中台），仅租户 apiKey 身份可用。新增 `TenantClient`，从内置的小映射表（`hym`、`mzmeso`）或 `config --tenantBaseUrl` 解析租户后台域名。

## 1.2.0

- `gen --template <id> --fields '{"key":"值"}'`: generate from an image template. Same black-box philosophy as `--skill` — the prompt template is expanded server-side and never sent back — but deterministic placeholder substitution instead of a chat-model expansion, so no chat cost. Template list comes from your own tenant's templates plus platform-shared ones.
- `templates` command: list available image templates (`--category` to filter), mirrors `skills`.
- Fixed: `-r, --ratio` had a hardcoded `3:4` default that silently overrode a skill's or template's own aspect ratio even when you didn't ask for one. It's now unset unless you pass it explicitly.

## 0.4.0

- `whoami`: show the logged-in account and its tenant affiliation (if the account was registered via a tenant's invite code), using the existing `/api/me` endpoint. `login` now prints this automatically right after signing in.
- Update check: `update-notifier` checks npm for a newer version at most once per 12h and prints a notice — no more silently running stale versions.
- `--version` now reads from `package.json` at runtime instead of a hardcoded string in `index.ts` (the two had already drifted out of sync once before 0.3.0).

## 0.3.0

- `jobs`: query your own (or your tenant's) recent image-generation history. `--limit`/`--status` are filtered client-side — the server always returns the 50 most recent jobs, no pagination.
- Fixed a bug where `gen` (and the new `jobs`) would crash before ever calling the API: the `withClient` wrapper dropped the `options` object for any command with flags but no positional argument.

## 0.2.0

- `login`/`logout`: device-authorization flow for individual platform users — no need to request a tenant apiKey just to generate images from your own account.
- Config file (`~/.studio-image.json`) now stored with `0600` permissions (it can hold a personal login token, not just a tenant apiKey).

## 0.1.0

- Initial release: `gen`, `reverse`, `upload`, `models`, `balance`, `config` — a CLI client for the studio image-generation platform, authenticated via tenant apiKey.
