# Changelog

## 未发布

**改名：npm 包 `@museav/cli`，命令 `museav`。** 产品叫 MUSE AV，命令却叫另一个名字，同一个东西两个叫法——这次统一到产品名。拿下 `@museav` scope 之后，以后出 `@museav/sdk`、`@museav/mcp` 不用再重新想名字。

- 迁移：`npm uninstall -g` 旧包后 `npm install -g @museav/cli`，脚本里的旧命令换成 `museav`，参数和行为完全不变。
- 配置文件改到 `~/.museav.json`，**旧路径仍会自动读取**（apiKey 明文中台只在创建时给一次，很多人唯一的一份就在那个文件里，直接不读等于逼人重置密钥）。
- 环境变量新增 `MUSEAV_API_KEY` / `MUSEAV_BASE_URL` / `MUSEAV_NO_WELCOME`；旧的 `STUDIO_*` 继续有效（中台对外文档和已经跑起来的 CI 写的都是旧名，不能说停就停），两个都设时新名优先。
- 自报身份头新增 `X-Museav-Client`，旧的 `X-Studio-Client` **过渡期继续发**，值统一改成 `museav-cli/<version>`。中台靠这个头把渠道记成 `cli`，两个头一起发是为了让中台能在不中断渠道统计的前提下切过去；等所有客户端升上来、中台停读旧头之后，这里再把旧头删掉。同时显式带上 `User-Agent: museav-cli/<version>`（中台有 UA 兜底匹配，Node 默认的 `node` 什么信息都没有）。

**新增 `image-to-template <file|url>`**：一张图 → 一个可复用的图片模板。读图（SCULPT）+ 文字层逆向 + 变量化 + 建模板，原图自动转存并焊进模板当参考图，所以换了文字还能出同款。支持 `--no-create`（只看草稿）、`--name` / `--slug` / `--category`、`--variables` 收窄变量白名单、`--labels` 把通用变量映射成你的业务叫法、`--async`。异步时按「接收图片 → 解析图片 → 抽取文字层 → 创建模板」逐阶段打进度，不是干转圈。

- `reverse` 保持**纯读图**不变。中台 2026-08-16 把读图和做模板拆成了两个接口，`/api/reverse` 现在收到任何模板类参数都会 400——本 CLI 的 `reverse` 一直只发图片，不受影响。
- `upload` 明确成通用素材上传：图片 / 音频 / 视频都收，类型按字节内容判定，上限分别是 8MB / 20MB / 50MB，输出里会标出识别到的类型。上传的 multipart 现在带上原文件名，出问题时日志里认得出是哪个文件。

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
