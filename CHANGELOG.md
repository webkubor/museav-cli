# Changelog

## 2.6.0 (2026-08-21)

### 新增：语音能力（`speak` / `transcribe`）

接入小米 MiMo 的语音档，**直连上游、不走中台身份**，只认 `MIMO_API_KEY` 环境变量。
中台的出音链路（`media_type=audio` 的路由与落盘）还没接完，而这批能力目前内部用——
没有那把 key 的人（包括租户）用不了，所以不需要额外做权限控制。

- `speak <text>`：文字转语音，输出 24kHz / 16bit 单声道 WAV，stdout 只打印文件路径。
  三种音色来源，给哪个参数走哪条：默认预置音色（`--voice`，默认 Chloe）、
  `--design` 一句话描述当场造一个、`--clone <file>` 拿一段音频克隆它的音色。
  `--instruction` 可叠加语气/风格指令。
- `transcribe <audio>`：语音转文字，stdout 只打印识别结果。

协议上有四个反直觉的点，都写进了 `src/mimo-speech.ts` 的文件头（实测踩出来的，写错不报错、
只是拿不到音频）：合成不走 `/v1/audio/speech`（OpenAI 那套音频端点全 404，四种能力共用
`/v1/chat/completions`）；**待合成文本要放 assistant 角色**，放 user 会得到一段「回答」而不是朗读；
音频是 base64 回在 `message.audio.data`；识别的输入音频在 user 的 content 数组里且要裸 base64。

### 已知限制

**识别结果的同音字会飘。** 同一段合成音频，一次识别成「声影成诗，一念成相」，另一次成
「上庸城失，一面呈象」。CLI 会在 stderr 提醒，但不要把它的输出直接用在计费、入库或需要
精确匹配的判断上。

## 2.5.0 (2026-08-17)

### 修复
- **`whoami` 不再拒绝 apiKey 模式**：之前会直接抛错「只支持个人 login 身份」。实际上 `/api/me` 对两种 apiKey 都返回真实数据——
  - 平台账户 apiKey（`STUDIO_API_KEY` 指向 `accounts.sk-*`）→ 账户身份：邮箱 + nickname + 累计出图次数 + credits
  - 租户 apiKey（指向 `api_tenants.tenant_key`）→ 业务身份：tenant_id + name + nickname + logo
  修复后三种身份都能 `museav whoami` 查清楚当前是谁、关联到哪个租户。

### 文档
- AGENTS.md `whoami` 说明：去掉「apiKey 不可用」的旧断言。

## 2.4.0 · 2026-08-17

**本地图像工具箱补全（免登录、零成本、macOS/Windows 通用）。** 均为轻量级工具，无大模型常驻内存。

- `upscale <file>`：Real-ESRGAN 超分（Vulkan GPU 加速），`--scale 2/3/4`、`--model`（通用照片 / 插画动漫）。首次自动下载引擎+模型（~65MB）；M3 实测 4x 约 30 秒。
- `remove-watermark <file>`：本地去水印。**纯像素启发式自动定位**（零模型依赖，角标式水印实测零误检）→ LaMa 掩码修复；复杂画面用 `--mask` 手工指定。修复模型 ~200MB 按需下载、用完即释放。
- 依赖红线：本地绝不自动拉起开源大模型（reverse 已翻回 API 默认，`--local` 显式可选；Ollama 与 qwen3-vl 已从本机卸载）。

**中台与前端联动。**

- 上游目录移除 gemini 死条目（路由/密钥早已清除，目录残留会误判读图有冗余），相关测试 mock 统一改用 volcengine-plan-vision。
- museav-web 参考图选择器接入工作区素材库：上传同步入库、素材库面板点选直接垫图、工作区切换自动刷新。
- 发布卡片样式重排：标题/升级命令/仓库链接全部对齐 `museav-cli` 新名（旧包名已停更，照旧卡片敲命令装不到新版），剥掉 changelog 标题噪声，双列字段 + 三按钮。

## 2.3.0 · 2026-08-17

**项目（工作区）与项目素材库。** 层级：平台 → 账户 → 工作区，素材挂工作区——人像库的项目出模特图、产品库的项目出电商图，业务隔离互不污染。`--project` 收 id 或名称。

- `projects` 列表 / `projects create --name` 新建（每账户最多 5 个）
- `projects assets --project` 素材库 ls / add / rm：素材按**母版不压缩**上传，类型按字节判定（图片/音频/视频），stdout 出 `id<TAB>url` 可直接喂 `--ref`
- `gen --project` 出图/出视频归档进项目；`jobs --project` 按项目查任务
- `--ref` / `--image` 现在也收 http(s) 直链（素材库 URL 直接垫图，不再只认本地文件）
- 需中台 `workspace-assets` 接口（2026-08-17 已上线）；账户 Key 白名单已放行

**本地图像工具箱（免登录、零成本、macOS/Windows 通用）。** 依赖全走 npm 预编译，代码零平台假设。

- `compress <file>`：sharp 压缩，`--max-edge / --quality / --format`，默认输出 `<名>-min.<格式>` 不覆写原文件，实测 597KB → 18KB
- `remove-bg <file>`：本地抠图去背景（ISNet + onnxruntime，刻意没用 AGPL 的现成包），输出带 alpha 的 PNG，热跑秒级；模型首次自动下载 ~170MB 缓存 `~/.museav-models`
- Ollama 未运行时的启动指引按操作系统区分（Windows 不再提示 brew）

## 2.2.0 · 2026-08-17

**`reverse` 主路改本地：Ollama + qwen3-vl。** 中台 API 读图要上传、排队、等云端推理；本地 8b 量化模型在自己机器上跑，免登录、零成本、离线可用。本地不可用（服务没起 / 模型没拉 / 推理出错）自动回落中台 API，回落时明确提示较慢，缺什么会告诉你补什么命令。

- 一次性配置：`brew install ollama && brew services start ollama && ollama pull qwen3-vl:8b`（Intel Mac / Linux 用官方安装脚本同理）。换模型档位设 `MUSEAV_LOCAL_VLM`（如 `qwen3-vl:4b`，更快、识图质量略降），自定服务地址走标准 `OLLAMA_HOST`。
- SCULPT 提示词从中台移植，砍掉本地不消费的 genre / body_md；返回归一化后与 API 路完全同构，`$(museav reverse x.png)` 管线用法不变，stdout 仍只出英文 prompt。
- 读图前复用上传同款压缩（压到视觉模型够用的尺寸），本地推理也跟着快。
- URL 输入固定走中台 API（本地路只收文件路径）；`--api` 强制走中台。
- 本地路完全不需要中台凭证——未登录也能用，只有真回落 API 时才提示登录。

**修复 `video-templates create` 必被 400 拒**：中台视频模板契约硬性要求 `slug`（required=['zh_name','slug']），且 toapis 2026-08-14 下线后 CLI 默认的 `seedance-2` 成了悬空引用——不带参数建视频模板必挂。现在 `--slug` 缺省自动生成 `vt-` 短标识并在 stderr 回显，默认模型改 `auto`（交给中台路由），`--duration` 放宽到 4-30（Seedance 2.5 支持到 30 秒）。

- `templates` / `video-templates` 列表兼容读 config 顶层的 `fields`（现行契约存法——CLI 自己 create 写的就是顶层，之前自己建的模板自己都列不出字段）。
- `gen` / `video-templates` 帮助文案与 README / AGENTS.md 示例里已下线的 `seedance-2-*` 代号全部清掉，照旧文案传参会 400。

## 2.0.0 · 2026-08-16

**改名：npm 包 `museav-cli`，命令 `museav`。** 产品叫 MUSE AV，命令却叫另一个名字，同一个东西两个叫法——这次统一到产品名。

不用 `@museav/cli` 是因为 npm 的 scope 规则：`@<用户名>` 自动可用（旧包 `@kubor/studio-cli` 就是这么来的），而 `@museav` 属于组织 scope，得先在 npmjs.com 建一个同名组织。发布账号是个人的，为一个 CLI 去建公司组织不值当，无 scope 的 `museav-cli` 跟命令名也更一致。

- 迁移：`npm uninstall -g` 旧包后 `npm install -g museav-cli`，脚本里的旧命令换成 `museav`，参数和行为完全不变。
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
