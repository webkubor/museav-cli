<div align="center">

<img src="https://museav.top/logo.svg" alt="studio" width="72" />

# museav（`museav-cli`）

[![npm version](https://img.shields.io/npm/v/%40museav%2Fcli)](https://www.npmjs.com/package/museav-cli)
[![license](https://img.shields.io/npm/l/%40museav%2Fcli)](./LICENSE)
[![node](https://img.shields.io/node/v/%40museav%2Fcli)](package.json)
[![CI](https://github.com/webkubor/museav-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/webkubor/museav-cli/actions/workflows/ci.yml)

**Agent-ready** — designed to be shelled out to directly, not just used by humans

[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-6366f1)](https://github.com/webkubor/museav-cli/blob/main/AGENTS.md)
[![Codex](https://img.shields.io/badge/Codex-compatible-10a37f)](https://github.com/webkubor/museav-cli/blob/main/AGENTS.md)
[![Hermes](https://img.shields.io/badge/Hermes-compatible-f2a65a)](https://github.com/webkubor/museav-cli/blob/main/AGENTS.md)
[![Antigravity](https://img.shields.io/badge/Antigravity-compatible-8b5cf6)](https://github.com/webkubor/museav-cli/blob/main/AGENTS.md)

</div>

> 命令行出图，一行配置就能用。背后的 [MUSE AV 中台](https://museav.top) 帮你搞定模型、密钥、路由、记账——你只管 prompt。

`museav` 是 [MUSE AV 出图中台](https://museav.top)（原 studio，API 走 [manager.museav.top](https://manager.museav.top)）的命令行客户端。装上它，登录（或配一个 apiKey），就能在终端里出图、逆向、图生图。给 Agent 用的详细说明见 [AGENTS.md](./AGENTS.md)。

> ### ⚠️ 改名了：包名 → `museav-cli`，命令 → `museav`
>
> 产品叫 MUSE AV，命令却叫另一个名字，同一个东西两个叫法。现在统一到产品名：
>
> ```bash
> npm uninstall -g @kubor/studio-cli   # 卸掉旧包（旧命令），否则两个命令并存
> npm install -g museav-cli           # 装新包，命令名是 museav
> ```
>
> - **命令名**：把脚本/CI 里的旧命令全部换成 `museav xxx`，参数和行为一模一样。
> - **配置文件**：新路径 `~/.museav.json`。旧路径的配置**仍会被自动读取**，不用重新 login，也不用再找一次 apiKey；下次 `config` / `login` 写入时自动落到新路径。
> - **环境变量**：`STUDIO_API_KEY` / `STUDIO_BASE_URL` 继续有效，同时新增等价的 `MUSEAV_API_KEY` / `MUSEAV_BASE_URL`（新名优先）。
> - **当库用**：`import { StudioClient } from 'museav-cli'`（类名不变）。
> - **自报身份头**：新增 `X-Museav-Client`，旧的 `X-Studio-Client` 过渡期继续发，两个值都是 `museav-cli/<version>`。
> - 旧包停止更新，只会留一条 deprecate 提示指向这里。

---

## 我该用这个吗？（先看这段，别猜）

**适合你，如果**：
- 你想在终端里随手出一张图，不想开浏览器
- 你在写脚本/自动化任务，需要程序化出图（比如批量生成、定时任务）
- 你是个 Agent（Claude Code / Codex / Hermes 等），被要求帮用户出图

**不适合你，如果你在做一个真正的产品/网站**：这个 CLI 是给终端用的，**不是** SDK 或后端集成方案。举个真实例子——好易美的 `hym-admin`（一个跑在 Cloudflare Pages Functions 上的业务后台）需要出图能力时，走的是两条路，都跟这个 CLI 无关：
1. 人要用完整界面 → 用 SSO 直接内嵌 [MUSE AV 网页版](https://museav.top)（iframe，登录态自动同步）
2. 后端要程序化调用 → 直接 `fetch('https://manager.museav.top/api/generate', { headers: { 'X-API-Key': ... } })`，或者 `import { StudioClient } from 'museav-cli'` 当库用

**这不是随便选的**：Cloudflare Pages Functions/Workers 这类边缘运行时压根不能起子进程，`museav` 这个 CLI 二进制在那种环境里根本跑不起来。做产品集成，永远是调 HTTP API 或者拿 `StudioClient` 当库导入；CLI 是给"人在终端里"或"agent 跑 shell 命令"这两个场景用的，别的地方用不上也不该用。

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

`museav` 这个 CLI 就是这套能力的命令行封装，**服务两类不同的使用者，鉴权方式也不一样**：

| 你是谁 | 怎么鉴权 | 适合场景 |
|---|---|---|
| **平台用户**——用中台网页版的个人账号 | `museav login`（网页登录，个人 JWT，7 天有效） | 自己出图、写个人脚本、agent 场景——你本人在用 |
| **租户**——要把出图能力接进自己的产品/服务对外提供 | apiKey（`sk-studio-xxx`，中台「租户管理」申请） | 服务端长期程序化调用、CI——代表一个"服务"在调，不依赖某个人的登录态 |

两条路径互不依赖，选跟你身份匹配的那条，不用两个都配。下面「快速开始」走的是平台用户（login）这条路；如果你是租户，直接跳到下面「B 端 / CI 场景」那一节。

## 能力速览（小白先看这个）

`museav` 能干什么，一句话一组：

| 分类 | 能力 | 命令 |
|---|---|---|
| **AI 生成**（中台） | 文字出图 / 垫图出图 / 技能出图 / 模板出图 | `gen`（含 `--ref` 垫图、`--transparent` 透明底） |
| | 文生视频 / 图生视频 | `gen --video` |
| | 从已有图片反推提示词 | `reverse` |
| | 一张图做成可复用模板 | `image-to-template` |
| | 建/查图片模板、视频模板 | `templates` / `video-templates` |
| **项目管理**（中台） | 工作区（项目）+ 每个项目自己的素材库 | `projects`、`projects assets` |
| | 素材直链垫图、作品归档进项目 | `gen --project`、`jobs --project` |
| **本地图像处理**（免登录/免费/离线） | 压缩图片 | `compress` |
| | 抠图去背景（输出透明 PNG） | `remove-bg` |
| | **放大清晰度**（2M → 10M+ 级） | `upscale` |
| | 去水印 | `remove-watermark` |
| **素材与统计** | 上传素材 / 查任务 / 查余额 / 查模型 / 查身份 | `upload` / `jobs` / `balance` / `models` / `whoami` |

> 本地工具（`compress` / `remove-bg` / `upscale` / `remove-watermark`）**不用登录、不花一分钱**，装了就能用；其余命令需要一个凭证（个人 `login` 或租户 apiKey）。

---

## 快速开始

### 1. 安装

```bash
# 从 npm 安装（推荐）
npm install -g museav-cli

# 或从 GitHub 全局安装
npm install -g github:webkubor/museav-cli

# 或克隆后本地构建
git clone https://github.com/webkubor/museav-cli.git
cd museav-cli && npm install && npm run build && npm link
```

要求 Node.js >= 20.19。

### 2. 登录

```bash
museav login
```

终端会显示一个验证码和链接，在浏览器打开链接、登录你的 [MUSE AV](https://museav.top) 账号、点批准，CLI 自动完成登录。登录态存到 `~/.museav.json`，7 天有效，过期重新 login 即可。

> **没有账号？** 这里说的是**平台用户的个人账号**（浏览器注册即可），跟下面「租户」的 apiKey 申请是两码事，不要混。先到 [museav.top](https://museav.top) 注册个人账号，再回来 login。

### 3. 出图

```bash
museav gen --prompt '演唱会海报，霓虹灯，赛博朋克'
# ✅ stdout 输出: https://img.webkubor.online/xxx.png
```

就这么简单。第一张图就这么出来了。

---

### B 端 / CI 场景：用 apikey 代替登录

**这是租户走的路径**，跟上面平台用户的个人 login 是不同身份、不同鉴权：你在给自己的产品/服务接入出图能力，代表的是一个"服务"而不是某个登录的人，所以用 apikey，不需要也不应该用个人登录态。CI 环境同理（没有浏览器，走不了 login 那套授权）：

```bash
# 方式一：config 命令存到本地
museav config --apiKey sk-studio-xxx

# 方式二：环境变量（CI 友好，优先级最高）
export STUDIO_API_KEY=sk-studio-xxx
```

apikey（业务中台服务 key，统一形态 `sk-studio-<24位>`) 从中台「租户管理」获取，适合脚本/服务长期使用。

---

## 完整用法

### 出图 `gen`

```bash
# 基本出图
museav gen --prompt '一只在月球上的猫'

# 宽高比（不指定则纯 prompt 模式兜底 3:4；--skill/--template 模式默认用技能/模板自己的比例）
museav gen --prompt '海报' --ratio 9:16    # 可选: 3:4 / 9:16 / 1:1 / 4:3 / 16:9

# 指定模型（不指定则中台自动选最优）
museav gen --prompt '...' --model gpt-image-2

# 质量（仅 gpt-image 生效）
museav gen --prompt '...' --quality high

# 图生图（自动上传垫图，保持人物面容）
museav gen --prompt '保持面容，换成西装' --ref face.png

# 透明背景 PNG（抠掉背景，出带 alpha 通道的图；可与 --ref 叠加）
museav gen --prompt '一只橘猫，产品级抠图' --transparent
museav gen --prompt '把这只鞋抠成透明底' --ref shoe.jpg --transparent
# 注意三件事：
#   · 只在提示词里写 "transparent background" 没用——那是构图描述，不是抠图开关，
#     真正生效的是 --transparent（它对应上游的 background 参数）
#   · 仅部分上游支持。没有可用上游时中台直接报错，不会悄悄给你一张白底图
#     （白底图看起来完全正常，静默降级只会让你以为提示词没写对，反复重试）
#   · 会强制 PNG 输出：JPEG / 有损 WebP 没有 alpha 通道，装不下透明

# 文生视频（不传 --model 走 auto 路由；锁死档次用 artsdance-2-0-pro-260801 这类代号，自动轮询直到完成）
museav gen --video --prompt '一只橘猫在窗台上伸懒腰，阳光洒进来，电影感' --ratio 9:16

# 图生视频（--image 传首帧图，自动上传）
museav gen --video --image logo.png --prompt 'logo 缓缓发光，背景渐暗' --ratio 1:1

# 管道用法：拿到 URL 存变量
URL=$(museav gen --prompt '海报')
curl -o poster.png "$URL"
```

### 用图片模板出图 `gen --template`

图片模板是提前配置好的提示词模板（可能带占位符），跟 `--skill` 是同一种"黑盒展开"哲学——
提示词正文在服务端展开、不下发——区别是模板走**确定性字符串替换**，不经 chat 模型，没有 chat 成本；
`--skill` 是让模型根据一句业务描述自由发挥。

```bash
# 先查有哪些模板（自己租户建的 + 平台共享的）
museav templates
museav templates --category 电商白底图    # 按分类过滤
museav templates --mine       # 只看我这个人建的
museav templates --tenant     # 只看本租户专属的
museav templates --platform   # 只看平台共享的
museav templates --type image # 按类型过滤（image / article）

# 没有占位符的模板，直接用
museav gen --template <模板id>

# 带占位符的模板，用 --fields 传 JSON 补齐
museav gen --template <模板id> --fields '{"artist":"王嘉尔","city":"南京"}'
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
museav templates create \
  --name "演唱会巡演海报" \
  --prompt "{artist} 在 {city} 的演唱会巡演海报，聚光灯氛围" \
  --category 演唱会 \
  --ratio 9:16

# 想要更友好的中文字段标签，自己传 --fields 覆盖自动提取的结果
museav templates create \
  --name "产品白底图" \
  --prompt "{product} 电商白底图，纯白背景，正面视角" \
  --fields '[{"key":"product","label":"产品名称"}]'
```

stdout 输出新建模板的 id，可以直接接 `gen --template`：

```bash
ID=$(museav templates create --name "..." --prompt "...")
museav gen --template "$ID" --fields '{"artist":"..."}'
```

### 图片逆向 `reverse`

逆推出图 prompt，可以直接拿去再出一张同风格。**默认走中台 API**（SCULPT 六要素：主体/构图/世界观/光影/输出/质感）；`--local` 可显式切本地 Ollama（需自备 qwen3-vl，本地不可用时自动回落 API）：

```bash
# 默认：中台 API（需登录）
museav reverse photo.png

# 显式本地：需 ollama pull qwen3-vl:8b 自备模型（本地大模型默认不自动拉起）
museav reverse photo.png --local

# 图片 URL 走中台 API
museav reverse https://example.com/photo.png

# 逆向 + 出图，一条龙
museav gen --prompt "$(museav reverse photo.png)"
```

分析详情打到 stderr（人看），**stdout 只输出英文 prompt**（机器用，方便管道）。

`reverse` **只读图**，不会顺手帮你建模板。要把图做成模板看下一节——中台 2026-08-16 把这两件事
拆成了两个接口，`reverse` 现在收到任何模板类参数都会直接报错，不会静默忽略。

### 图生模板 `image-to-template`

看中一张图，想以后只改几个字就批量出同款？这个命令把它做成模具：读图（SCULPT）+ **文字层逆向**
（图上每处文字的角色/字体/字重/颜色/位置/处理效果）+ 变量化，最后建成一个图片模板，
**原图会被转存并焊进模板当参考图**——所以换了文字之后风格还能对得上。

```bash
# 最常用：一张图直接建成模板（异步，终端会按阶段打进度）
museav image-to-template poster.jpg
#   🔄 接收图片 → 解析图片 → 抽取文字层 → 创建模板
#   stdout: 新模板的 id

# 只想先看看会做成什么样，不真的建（同步返回草稿，stdout 是完整 JSON）
museav image-to-template poster.jpg --no-create

# 指定模板名 / slug / 分类（slug 全局唯一，撞了直接报错，绝不覆盖已有模板）
museav image-to-template poster.jpg --name "暗金演唱会主视觉" --slug gala-2026 --category 海报

# 收窄变量白名单：只允许改这几个，模型不能自己发明别的
museav image-to-template poster.jpg --variables title,subject,location

# 变量 key 是中台通用语义，展示成你自己的业务叫法用 --labels
museav image-to-template poster.jpg --labels '{"subject":"艺人","location":"城市"}'

# 图片 URL 也行
museav image-to-template https://example.com/poster.jpg
```

建完直接就能用：

```bash
ID=$(museav image-to-template poster.jpg)
museav gen --template "$ID" --fields '{"title":"新的主标题"}'
```

几个容易踩的点：

- **变量 key 是固定白名单**（`title` / `subtitle` / `subject` / `date` / `location` / `watermark` /
  `body` / `cta` / `style`），是通用语义不是某一家的业务词。你的叫法用 `--labels` 映射到表单显示名，
  key 本身不变——这样同一套模板换个业务也能读懂。
- **建模板要租户 key 或平台管理员身份**。发给成员的个人账户 key 打不到这个能力（建模板是往组织的
  模板库里添资产，跟出图不是一回事），这种情况下读图结果照常返回，只是模板建不成并说明原因。
- **降级不是失败**：文字层逆向 / 变量化 / 建模板任一步出问题，读图结果（SCULPT、prompt）照常给你，
  只是没有模具。命令会明确告诉你卡在哪一步。

### 上传素材 `upload`

图片、音频、视频都能传，中台按**文件字节内容**判类型（不看扩展名，也不信客户端声明的 MIME），
返回公网直链：

```bash
museav upload face.png
# stdout: https://img.webkubor.online/refs/...
```

大小上限按类型分：图片 8MB / 音频 20MB / 视频 50MB；认不出类型的文件会被拒绝。
拿到的 URL 可以直接喂给 `gen --ref`、`gen --video --image`，或当作 `reverse` /
`image-to-template` 的图片 URL 入参。

> `gen --ref` / `gen --video --image` 内部已经自动帮你上传了，不需要先手动跑一次 `upload`。
> 单独用 `upload` 的场景是：同一张垫图要复用多次，或者你想把 URL 存下来给别的系统用。

### 本地图像工具 `compress` / `remove-bg`

纯本地、免登录、不消耗中台额度，macOS / Windows / Linux 通用（依赖全走 npm 预编译，无平台特化代码）：

```bash
# 压缩：默认同目录 <名>-min.<格式>，绝不覆写原文件
museav compress photo.jpg
museav compress photo.jpg --max-edge 800 --format webp --quality 70   # 597KB → 18KB 级别

# 抠图去背景：输出带 alpha 的 PNG（ISNet 模型，本地 ONNX 推理，热跑秒级）
museav remove-bg product.png
# stdout 都是产物路径，方便管道串联
museav gen --prompt "$(museav reverse $(museav remove-bg shoe.png))"   # 抠图 → 逆向 → 重生成
```

- `compress` 用 sharp（已是 CLI 可选依赖）；`remove-bg` 用 onnxruntime-node + ISNet/U2Net 模型（均 MIT/Apache 兼容许可证，刻意没用 AGPL 的现成 npm 包）。模型首次使用自动下载 ~170MB，缓存到 `~/.museav-models/`（Windows 是 `%USERPROFILE%\.museav-models`）。
- 两个命令的输出默认带后缀（`-min` / `-nobg`），不会覆盖你的输入文件；要覆盖已存在的输出加 `--overwrite`。
- 可选依赖缺失时不炸，报一行重装指引（`npm install -g museav-cli`）。

### 超分 `upscale` 与去水印 `remove-watermark`（轻量工具，无大模型常驻）

```bash
# 超分放大（Real-ESRGAN + Vulkan GPU；首次自动下载引擎+模型 ~65MB）
museav upscale photo.jpg --scale 4                     # 默认输出 <名>-4x.png
museav upscale anime.png --model realesrgan-x4plus-anime

# 去水印（纯像素启发式定位 → LaMa 修复，零模型依赖；修复模型 ~200MB 按需下载）
museav remove-watermark photo.jpg                      # 角标式水印自动定位
museav remove-watermark photo.jpg --mask mask.png      # 复杂画面手工掩码（白=去除区）
```

- 依赖红线：本地**绝不自动拉起开源大模型**——这些工具是轻量 CNN/传统算法，用完即释放内存。reverse 的本地路已翻回显式 `--local`（需自备 Ollama），默认走中台 API。
- 二进制与模型缓存：`~/.museav-bin/upscayl`（引擎）、`~/.museav-models/`（模型），Windows 对应 `%USERPROFILE%` 下同名目录；删除即彻底清理。

### 项目（工作区）与项目素材库 `projects`

层级：**平台 → 账户 → 工作区**。一个账户最多 5 个项目，每个项目挂自己的素材库——「人像库的项目出模特图、产品库的项目出电商图」，业务隔离互不污染：

```bash
museav projects                                        # 列项目（id / 名称 / 出图统计）
museav projects create --name 'meso猫砂电商'            # 新建
museav projects assets --project meso                  # 列该项目素材库（stdout: id<TAB>url）
museav projects assets add ./model.jpg --project meso --name '白T正面' --tag 产品 --tag 电商
museav projects assets rm <素材id>

# 生成归档进项目；垫图直接用素材库里的 URL
museav gen --project meso --prompt '...' --ref <素材URL>
museav jobs --project meso                             # 只看该项目的任务
```

素材是**母版不压缩**（跟垫图上传的视觉压缩是两回事），类型按字节判定（图片/音频/视频）。`--project` 收 id 或名称，重名时提示用 id。**需要中台部署 `workspace-assets` 接口后可用**（含账户 Key 白名单放行）。

### 查模型 / 余额

```bash
museav models      # 中台当前可用的模型
museav balance     # 各上游余额
```

### 查自己名下的工作流 `jobs`

租户额外多一项能力：能查到**自己业务下**的出图工作流，不止是刚提交的那一个任务：

```bash
museav jobs                    # 最近 20 条
museav jobs --limit 50         # 最近 50 条（服务端上限就是 50，--limit 只能在这以内截取，查不到更早的历史）
museav jobs --status failed    # 只看失败的（本地过滤，不是服务端查询）
```

范围自动跟着你用的凭证走，不用额外传租户/用户 id：个人 login 只看到自己出的图；租户 apiKey 看到的是这个租户名下的全部记录（不管是谁、哪个服务调用生成的）。stdout 输出完整 JSON 数组，方便接自己的后台统计。

---

### 查所属租户自己的产品 / 素材 `products` / `assets`

> 2026-08-10 新增，**仅租户 apiKey 身份可用**，个人 login 用不了。

这两个命令跟前面所有命令不一样：数据**不在** studio 中台，而在租户自己的后台（好易美是
`hym-admin`，mzmeso 是 `manager`）——产品/素材是各租户自己业务侧的数据，物理上存在他们
自己的数据库里，中台从不代理这部分数据。CLI 会直接调租户自己的域名，用你配置的同一把
`sk-studio-xxx`（业务中台服务 key）当凭证（这把 key 反正租户后台自己也存着一份用来倒过来调中台，
两边共用，不用再单独申请一把）：

```bash
museav products    # 查所属租户自己的产品目录
museav assets      # 查所属租户自己的素材/资产库
```

已知已接入的租户（hym / mzmeso）用**旧格式 key**（`sk-studio-<租户名>-<24位>`）不用额外配置，CLI 内置了它们后台的域名；
统一形态新 key（`sk-studio-<24位>`）不带租户名，需要显式配置后台域名（其他租户/本地联调同理）：

```bash
museav config --tenantBaseUrl https://your-tenant-backend.example.com
```

**不是每个租户都两个命令都能用**：比如好易美是演唱会海报/票务业务，没有"产品"这个概念，
它的后台没开通 `tenant-products`，调 `products` 会报错——这是预期行为，不是 bug。
`assets` 的返回结构也没有强行统一：好易美是 `{ celebrity_materials, stickers }`，
mzmeso 是一个扁平数组，CLI 会按返回形状分别展示。

典型用法——配合 `gen --template` 做"选参考图 + 模板 组合出图"：

```bash
IMG=$(museav products | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d)[0].cover_image_url))")
museav gen --template <模板id> --ref "$IMG"
```

## 编程调用

CLI 背后是一个干净的 `StudioClient` class，也可以当库用：

```ts
import { StudioClient } from 'museav-cli'

// 方式一：用 login 拿到的 token（个人用户）
const studio = new StudioClient({
  baseUrl: 'https://manager.museav.top',
  token: process.env.STUDIO_TOKEN!,  // 或从 ~/.museav.json 读
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
| `gen` | 出图 / 出视频（`--prompt` / `--skill` / `--template` 三选一；`--video` 切视频，`--image` 图生视频） | 图片/视频 URL |
| `skills` | 查可用技能：私有 + 租户专属 + 公共库（配合 `gen --skill`） | slug 列表（每行一个） |
| `templates` | 查可用图片模板（配合 `gen --template`） | JSON |
| `templates create` | 新建图片模板，归属按账号身份自动关联租户 | 新模板 id |
| `products` | 查所属租户自己的产品目录（数据在租户自己后台，非中台；仅租户 apiKey） | JSON |
| `assets` | 查所属租户自己的素材/资产库（数据在租户自己后台，非中台；仅租户 apiKey） | JSON |
| `reverse <file\|url>` | 读图，反推 prompt（**只读图**，不建模板） | 英文 prompt |
| `image-to-template <file\|url>` | 图生模板：读图 + 文字层逆向 + 变量化 → 建成可复用图片模板 | 模板 id（`--no-create` 时是草稿 JSON） |
| `upload <file>` | 上传素材（图片/音频/视频） | 公网直链 |
| `compress <file>` | 本地压缩图片（免登录，`--max-edge`/`--quality`/`--format`） | 产物路径 |
| `remove-bg <file>` | 本地抠图去背景（免登录，输出带 alpha 的 PNG） | 产物路径 |
| `upscale <file>` | 本地超分放大，2M 图变 10M+（免登录，Real-ESRGAN GPU，`--scale 2/3/4`） | 产物路径 |
| `remove-watermark <file>` | 本地去水印（免登录，自动定位 + LaMa 修复，`--mask` 手工兜底） | 产物路径 |
| `projects` | 工作区（项目）列表：一账户多项目，各带自己的素材库 | 项目 id 列表 |
| `projects assets --project` | 项目素材库：ls / add / rm（垫图母版，人像库/产品库各管各的） | `id<TAB>url` 行 |
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

- **平台用户**：自己写自动化脚本/agent 需要命令行出图、个人多个项目想统一收口到一个能力服务——`museav login` 就够，不需要申请 apiKey
- **租户**：做 AI 产品的开发者，要把出图能力接进自己对外提供的产品/服务，不想碰上游细节——申请 apiKey，走服务端集成。租户还多一项平台用户没有的能力：`museav jobs` 能查到自己业务下全部的出图工作流（不止是当前这一个任务），方便对账/统计/排查

**接入方式**：平台用户直接 `museav login`；租户到中台「租户管理」注册拿 apiKey，装上这个 CLI（或直接调 API）用 `config --apiKey` / `STUDIO_API_KEY` 配置。具体配额和计费见中台后台。

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

## 发布（维护者专用）

正式发布**必须走 v tag**（触发 GitHub Actions `publish.yml`），不要本地 `npm publish`：

```bash
npm version patch            # bump 版本（自动 commit + tag vX.Y.Z）
git push origin main         # 推代码
git push origin vX.Y.Z       # 推 tag → 触发 Actions
```

GitHub Actions 自动完成：

1. 校验 tag 与 package.json 版本一致 → `npm publish --provenance`
2. 回调业务中台 `POST /api/cli-release`（`CLI_RELEASE_TOKEN` 鉴权）——中台记录更新日志，并用 App 发卡片通知到下游群（mzmeso / 好易美等，群配置在业务中台 `CLI_RELEASE_CHAT_IDS`，改群只动中台）
3. 版本号由 `/api/cli-guide` 动态查 npm registry 自动同步（下游引导不用手动改）

前置条件：仓库 Secrets 需配置 `NPM_TOKEN`（或 npmjs 配 Trusted Publishing）和 `CLI_RELEASE_TOKEN`（= 业务中台 `secret://studio/cli-release-token` 的值）。

**坑（2026-08-15 实录）**：

- GitHub Actions 的 `if:` 表达式**不能直接用 `secrets`**（报 `Unrecognized named-value`），secret 要放 step `env` 再在 `run` 里判断。
- 改 workflow 后本地 `npx yaml-lint` 校验（GitHub 解析失败会显示 "workflow file issue"）。
- 不要往租户群发"纯测试"卡片——发布链路验证用正式版本内容，发成功就是正式通知。
