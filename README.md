<div align="center">

<img src="https://museav.top/logo.svg" alt="studio" width="72" />

# studio-cli

[![npm version](https://img.shields.io/npm/v/%40kubor%2Fstudio-cli)](https://www.npmjs.com/package/@kubor/studio-cli)
[![license](https://img.shields.io/npm/l/%40kubor%2Fstudio-cli)](./LICENSE)
[![node](https://img.shields.io/node/v/%40kubor%2Fstudio-cli)](package.json)
[![CI](https://github.com/webkubor/studio-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/webkubor/studio-cli/actions/workflows/ci.yml)

**Agent-ready** — designed to be shelled out to directly, not just used by humans

[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-6366f1)](https://github.com/webkubor/studio-cli/blob/main/AGENTS.md)
[![Codex](https://img.shields.io/badge/Codex-compatible-10a37f)](https://github.com/webkubor/studio-cli/blob/main/AGENTS.md)
[![Hermes](https://img.shields.io/badge/Hermes-compatible-f2a65a)](https://github.com/webkubor/studio-cli/blob/main/AGENTS.md)
[![Antigravity](https://img.shields.io/badge/Antigravity-compatible-8b5cf6)](https://github.com/webkubor/studio-cli/blob/main/AGENTS.md)

</div>

> 命令行出图，一行配置就能用。背后的 [MUSE AV 中台](https://museav.top) 帮你搞定模型、密钥、路由、记账——你只管 prompt。

`studio-cli` 是 [MUSE AV 出图中台](https://museav.top)（原 studio，API 走 [manager.museav.top](https://manager.museav.top)）的命令行客户端。装上它，登录（或配一个 apiKey），就能在终端里出图、逆向、图生图。给 Agent 用的详细说明见 [AGENTS.md](./AGENTS.md)。

---

## 我该用这个吗？（先看这段，别猜）

**适合你，如果**：
- 你想在终端里随手出一张图，不想开浏览器
- 你在写脚本/自动化任务，需要程序化出图（比如批量生成、定时任务）
- 你是个 Agent（Claude Code / Codex / Hermes 等），被要求帮用户出图

**不适合你，如果你在做一个真正的产品/网站**：这个 CLI 是给终端用的，**不是** SDK 或后端集成方案。举个真实例子——好易美的 `hym-admin`（一个跑在 Cloudflare Pages Functions 上的业务后台）需要出图能力时，走的是两条路，都跟这个 CLI 无关：
1. 人要用完整界面 → 用 SSO 直接内嵌 [MUSE AV 网页版](https://museav.top)（iframe，登录态自动同步）
2. 后端要程序化调用 → 直接 `fetch('https://manager.museav.top/api/generate', { headers: { 'X-API-Key': ... } })`，或者 `import { StudioClient } from '@kubor/studio-cli'` 当库用

**这不是随便选的**：Cloudflare Pages Functions/Workers 这类边缘运行时压根不能起子进程，`studio-cli` 这个 CLI 二进制在那种环境里根本跑不起来。做产品集成，永远是调 HTTP API 或者拿 `StudioClient` 当库导入；CLI 是给"人在终端里"或"agent 跑 shell 命令"这两个场景用的，别的地方用不上也不该用。

---

## 这是什么？为什么要用它？

如果你做过 AI 出图，一定踩过这些坑：

- 上游模型 key 要自己申请、自己充值、自己保管
- gpt-image / 豆包 / 各家 API 格式不一样，得分别对接
- 某家挂了要手动切备用，限流要自己处理
- 成本要自己算、自己记账

**studio 中台把这些全包了。** 它是一个部署在 Cloudflare 上的出图能力服务，对外暴露统一的 HTTP API：

```
你（个人 login / 租户 apiKey）        studio 中台
    │                                  │
    ├── 一个凭证（token 或 apiKey）───►│ 鉴权
    ├── prompt + 宽高比 ──────────────►│ 选模型 + 调上游 + 容错 + 记账
    ◄── 图片 URL ──────────────────────│
```

你永远不用接触上游 key，也不用关心用的哪个模型（除非你想指定）。

`studio-cli` 这个 CLI 就是这套能力的命令行封装，**服务两类不同的使用者，鉴权方式也不一样**：

| 你是谁 | 怎么鉴权 | 适合场景 |
|---|---|---|
| **平台用户**——用中台网页版的个人账号 | `studio-cli login`（网页登录，个人 JWT，7 天有效） | 自己出图、写个人脚本、agent 场景——你本人在用 |
| **租户**——要把出图能力接进自己的产品/服务对外提供 | apiKey（`sk-studio-xxx`，中台「租户管理」申请） | 服务端长期程序化调用、CI——代表一个"服务"在调，不依赖某个人的登录态 |

两条路径互不依赖，选跟你身份匹配的那条，不用两个都配。下面「快速开始」走的是平台用户（login）这条路；如果你是租户，直接跳到下面「B 端 / CI 场景」那一节。

---

## 快速开始

### 1. 安装

```bash
# 从 npm 安装（推荐）
npm install -g @kubor/studio-cli

# 或从 GitHub 全局安装
npm install -g github:webkubor/studio-cli

# 或克隆后本地构建
git clone https://github.com/webkubor/studio-cli.git
cd studio-cli && npm install && npm run build && npm link
```

要求 Node.js >= 18。

### 2. 登录

```bash
studio-cli login
```

终端会显示一个验证码和链接，在浏览器打开链接、登录你的 [MUSE AV](https://museav.top) 账号、点批准，CLI 自动完成登录。登录态存到 `~/.studio-cli.json`，7 天有效，过期重新 login 即可。

> **没有账号？** 这里说的是**平台用户的个人账号**（浏览器注册即可），跟下面「租户」的 apiKey 申请是两码事，不要混。先到 [museav.top](https://museav.top) 注册个人账号，再回来 login。

### 3. 出图

```bash
studio-cli gen --prompt '演唱会海报，霓虹灯，赛博朋克'
# ✅ stdout 输出: https://img.webkubor.online/xxx.png
```

就这么简单。第一张图就这么出来了。

---

### B 端 / CI 场景：用 apikey 代替登录

**这是租户走的路径**，跟上面平台用户的个人 login 是不同身份、不同鉴权：你在给自己的产品/服务接入出图能力，代表的是一个"服务"而不是某个登录的人，所以用 apikey，不需要也不应该用个人登录态。CI 环境同理（没有浏览器，走不了 login 那套授权）：

```bash
# 方式一：config 命令存到本地
studio-cli config --apiKey sk-studio-xxx

# 方式二：环境变量（CI 友好，优先级最高）
export STUDIO_API_KEY=sk-studio-xxx
```

apikey（`sk-studio-<name>-<hex>`）从中台「租户管理」获取，适合脚本/服务长期使用。

---

## 完整用法

### 出图 `gen`

```bash
# 基本出图
studio-cli gen --prompt '一只在月球上的猫'

# 宽高比（不指定则纯 prompt 模式兜底 3:4；--skill/--template 模式默认用技能/模板自己的比例）
studio-cli gen --prompt '海报' --ratio 9:16    # 可选: 3:4 / 9:16 / 1:1 / 4:3 / 16:9

# 指定模型（不指定则中台自动选最优）
studio-cli gen --prompt '...' --model gpt-image-2

# 质量（仅 gpt-image 生效）
studio-cli gen --prompt '...' --quality high

# 图生图（自动上传垫图，保持人物面容）
studio-cli gen --prompt '保持面容，换成西装' --ref face.png

# 管道用法：拿到 URL 存变量
URL=$(studio-cli gen --prompt '海报')
curl -o poster.png "$URL"
```

### 用图片模板出图 `gen --template`

图片模板是提前配置好的提示词模板（可能带占位符），跟 `--skill` 是同一种"黑盒展开"哲学——
提示词正文在服务端展开、不下发——区别是模板走**确定性字符串替换**，不经 chat 模型，没有 chat 成本；
`--skill` 是让模型根据一句业务描述自由发挥。

```bash
# 先查有哪些模板（自己租户建的 + 平台共享的）
studio-cli templates
studio-cli templates --category 电商白底图    # 按分类过滤

# 没有占位符的模板，直接用
studio-cli gen --template <模板id>

# 带占位符的模板，用 --fields 传 JSON 补齐
studio-cli gen --template <模板id> --fields '{"artist":"王嘉尔","city":"南京"}'
```

`templates` 命令的输出里，模板名后面跟着的"字段:xxx"就是需要传给 `--fields` 的 key。

### 新建图片模板 `templates create`

> 2026-08-10 新增。之前只能网页后台建模板，纯命令行/脚本化场景（比如没人会去点网页，或者
> 想批量导入一批固定套路）建不了新模板，只能靠每次手写 `--prompt`——但这满足不了"同一种图、
> 反复出、风格锁死"的固定业务场景。这个命令补上了这条路。

**归属不用自己传，账号身份自动决定**：租户 apiKey 建的模板自动归该租户（其他租户看不到）；
平台管理员账号建的是 `tenant_id` 为空的平台共享模板（所有租户可见）；个人账号（未登录成租户、
也不是管理员）会被服务端拒绝——这条权限规则在服务端强制执行，CLI 这层不做也不能绕过。

```bash
# 占位符用 {key} 形式，不传 --fields 会自动从 --prompt 里提取
studio-cli templates create \
  --name "演唱会巡演海报" \
  --prompt "{artist} 在 {city} 的演唱会巡演海报，聚光灯氛围" \
  --category 演唱会 \
  --ratio 9:16

# 想要更友好的中文字段标签，自己传 --fields 覆盖自动提取的结果
studio-cli templates create \
  --name "产品白底图" \
  --prompt "{product} 电商白底图，纯白背景，正面视角" \
  --fields '[{"key":"product","label":"产品名称"}]'
```

stdout 输出新建模板的 id，可以直接接 `gen --template`：

```bash
ID=$(studio-cli templates create --name "..." --prompt "...")
studio-cli gen --template "$ID" --fields '{"artist":"..."}'
```

### 图片逆向 `reverse`

上传一张图，中台用 **SCULPT 六要素**（主体/构图/世界观/光影/输出/质感）逆推出图 prompt，可以直接拿去再出一张同风格的：

```bash
# 本地文件或图片 URL 都行
studio-cli reverse photo.png
studio-cli reverse https://example.com/photo.png

# 逆向 + 出图，一条龙
studio-cli gen --prompt "$(studio-cli reverse photo.png)"
```

分析详情打到 stderr（人看），**stdout 只输出英文 prompt**（机器用，方便管道）。

### 上传垫图 `upload`

```bash
studio-cli upload face.png
# stdout: https://img.webkubor.online/refs/...
```

### 查模型 / 余额

```bash
studio-cli models      # 中台当前可用的模型
studio-cli balance     # 各上游余额
```

### 查自己名下的工作流 `jobs`

租户额外多一项能力：能查到**自己业务下**的出图工作流，不止是刚提交的那一个任务：

```bash
studio-cli jobs                    # 最近 20 条
studio-cli jobs --limit 50         # 最近 50 条（服务端上限就是 50，--limit 只能在这以内截取，查不到更早的历史）
studio-cli jobs --status failed    # 只看失败的（本地过滤，不是服务端查询）
```

范围自动跟着你用的凭证走，不用额外传租户/用户 id：个人 login 只看到自己出的图；租户 apiKey 看到的是这个租户名下的全部记录（不管是谁、哪个服务调用生成的）。stdout 输出完整 JSON 数组，方便接自己的后台统计。

---

### 查所属租户自己的产品 / 素材 `products` / `assets`

> 2026-08-10 新增，**仅租户 apiKey 身份可用**，个人 login 用不了。

这两个命令跟前面所有命令不一样：数据**不在** studio 中台，而在租户自己的后台（好易美是
`hym-admin`，mzmeso 是 `manager`）——产品/素材是各租户自己业务侧的数据，物理上存在他们
自己的数据库里，中台从不代理这部分数据。CLI 会直接调租户自己的域名，用你配置的同一把
`sk-studio-<租户名>-xxx` 当凭证（这把 key 反正租户后台自己也存着一份用来倒过来调中台，
两边共用，不用再单独申请一把）：

```bash
studio-cli products    # 查所属租户自己的产品目录
studio-cli assets      # 查所属租户自己的素材/资产库
```

已知已接入的租户（hym / mzmeso）不用额外配置，CLI 内置了它们后台的域名；其他租户/本地联调用：

```bash
studio-cli config --tenantBaseUrl https://your-tenant-backend.example.com
```

**不是每个租户都两个命令都能用**：比如好易美是演唱会海报/票务业务，没有"产品"这个概念，
它的后台没开通 `tenant-products`，调 `products` 会报错——这是预期行为，不是 bug。
`assets` 的返回结构也没有强行统一：好易美是 `{ celebrity_materials, stickers }`，
mzmeso 是一个扁平数组，CLI 会按返回形状分别展示。

典型用法——配合 `gen --template` 做"选参考图 + 模板 组合出图"：

```bash
IMG=$(studio-cli products | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d)[0].cover_image_url))")
studio-cli gen --template <模板id> --ref "$IMG"
```

## 编程调用

CLI 背后是一个干净的 `StudioClient` class，也可以当库用：

```ts
import { StudioClient } from '@kubor/studio-cli'

// 方式一：用 login 拿到的 token（个人用户）
const studio = new StudioClient({
  baseUrl: 'https://manager.museav.top',
  token: process.env.STUDIO_TOKEN!,  // 或从 ~/.studio-cli.json 读
})

// 方式二：用 apikey（租户/B 端）
const studio2 = new StudioClient({
  baseUrl: 'https://manager.museav.top',
  apiKey: process.env.STUDIO_API_KEY!,
})

// 出图（自动轮询直到完成）
const job = await studio.generateAndWait({ prompt: '一只猫', ratio: '3:4' })
console.log(job.cdn_url)

// 图片逆向
const r = await studio.reverse({ file: 'photo.png' })
console.log(r.prompt_cn)     // 中文 prompt
console.log(r.sculpt.light)  // 光影分析
```

---

## 命令一览

| 命令 | 用途 | stdout 输出 |
|------|------|------------|
| `login` | 登录（设备授权） | — |
| `logout` | 退出登录 | — |
| `whoami` | 查当前账户 + 租户归属（仅个人 login） | JSON |
| `gen` | 出图 | 图片 URL |
| `templates` | 查可用图片模板（配合 `gen --template`） | JSON |
| `templates create` | 新建图片模板，归属按账号身份自动关联租户 | 新模板 id |
| `products` | 查所属租户自己的产品目录（数据在租户自己后台，非中台；仅租户 apiKey） | JSON |
| `assets` | 查所属租户自己的素材/资产库（数据在租户自己后台，非中台；仅租户 apiKey） | JSON |
| `reverse <file\|url>` | 图片逆向 | 英文 prompt |
| `upload <file>` | 上传垫图 | 图片 URL |
| `models` | 可用模型 | 模型名列表 |
| `balance` | 上游余额 | JSON |
| `jobs` | 查自己（租户则是自己业务下）的工作流 | JSON 数组 |
| `config` | 配置中台（B 端 apikey，含 `--tenantBaseUrl`） | — |

**stdout 只输出最终结果**，进度信息走 stderr——方便脚本和管道集成。

---

## 关于 studio 中台

[museav.top](https://museav.top)（API 走 [manager.museav.top](https://manager.museav.top)）是一个**出图能力中台**：聚合多家上游图像模型（gpt-image、豆包 Seedream 等），统一成一套 API 对外开放。

**它解决的问题**：

| 你不用管 | 中台替你做 |
|---------|-----------|
| 上游 key 的申请/充值/保管 | 密钥只在中心，永不下发 |
| 各家 API 格式差异 | 一套统一的 OpenAI 兼容接口 |
| 某家挂了/限流 | 自动路由 + 容错 + 降级 |
| 算成本/记账 | 每次调用自动记账，可查余额和用量 |
| 选哪个模型 | 默认自动调度，也可指定 |

**适合谁用**（对应本文最开始那张鉴权对照表）：

- **平台用户**：自己写自动化脚本/agent 需要命令行出图、个人多个项目想统一收口到一个能力服务——`studio-cli login` 就够，不需要申请 apiKey
- **租户**：做 AI 产品的开发者，要把出图能力接进自己对外提供的产品/服务，不想碰上游细节——申请 apiKey，走服务端集成。租户还多一项平台用户没有的能力：`studio-cli jobs` 能查到自己业务下全部的出图工作流（不止是当前这一个任务），方便对账/统计/排查

**接入方式**：平台用户直接 `studio-cli login`；租户到中台「租户管理」注册拿 apiKey，装上这个 CLI（或直接调 API）用 `config --apiKey` / `STUDIO_API_KEY` 配置。具体配额和计费见中台后台。

---

## 发布（维护者）

CI 已接管发布，本机不用再 `npm publish`：

```bash
npm version patch      # 或 minor / major，会自动打好 v* tag
git push --follow-tags # 推 tag 触发 .github/workflows/publish.yml
```

workflow 会跑 typecheck → build → 版本号与 tag 一致性校验 → 冒烟测试（`--version` / `--help`）→ 带
[provenance](https://docs.npmjs.com/generating-provenance-statements) 发布。

认证两种选一种，选好后 workflow 文件不用改：

| 方式 | 怎么配 | 说明 |
|---|---|---|
| **Trusted Publishing**（推荐） | npmjs.com → 本包 Settings → Trusted Publisher 绑定本仓库 + workflow 文件名 `publish.yml`；**不要**设 `NPM_TOKEN` | 走 OIDC，无 token、不受 2FA 影响、不会过期 |
| **NPM_TOKEN** | 建 Granular token（Read and write，范围勾 `@kubor` scope 或 All packages）→ 存仓库 Secrets 的 `NPM_TOKEN` | 兜底方案。**别只勾单个包**——那样能 deprecate 却发不了新包 |

本机手动发布（应急）：账号 2FA 若为 `auth-and-writes`，每次 publish 都要 OTP；
`npm profile set twofa auth-only` 之后只有登录才要。

## License

MIT
