# studio-image

> 命令行出图，一行配置就能用。背后的 [studio 中台](https://studio.webkubor.online) 帮你搞定模型、密钥、路由、记账——你只管 prompt。

`studio-image` 是 [studio 出图中台](https://studio.webkubor.online) 的命令行客户端。装上它，登录（或配一个 apiKey），就能在终端里出图、逆向、图生图。

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

`studio-image` 这个 CLI 就是这套能力的命令行封装，**服务两类不同的使用者，鉴权方式也不一样**：

| 你是谁 | 怎么鉴权 | 适合场景 |
|---|---|---|
| **平台用户**——用中台网页版的个人账号 | `studio-image login`（网页登录，个人 JWT，7 天有效） | 自己出图、写个人脚本、agent 场景——你本人在用 |
| **租户**——要把出图能力接进自己的产品/服务对外提供 | apiKey（`sk-studio-xxx`，中台「租户管理」申请） | 服务端长期程序化调用、CI——代表一个"服务"在调，不依赖某个人的登录态 |

两条路径互不依赖，选跟你身份匹配的那条，不用两个都配。下面「快速开始」走的是平台用户（login）这条路；如果你是租户，直接跳到下面「B 端 / CI 场景」那一节。

---

## 快速开始

### 1. 安装

```bash
# 从 GitHub 全局安装
npm install -g github:webkubor/studio-image

# 或克隆后本地构建
git clone https://github.com/webkubor/studio-image.git
cd studio-image && npm install && npm run build && npm link
```

要求 Node.js >= 18。

### 2. 登录

```bash
studio-image login
```

终端会显示一个验证码和链接，在浏览器打开链接、登录你的 [studio 中台](https://studio.webkubor.online) 账号、点批准，CLI 自动完成登录。登录态存到 `~/.studio-image.json`，7 天有效，过期重新 login 即可。

> **没有账号？** 这里说的是**平台用户的个人账号**（浏览器注册即可），跟下面「租户」的 apiKey 申请是两码事，不要混。先到 [studio.webkubor.online](https://studio.webkubor.online) 注册个人账号，再回来 login。

### 3. 出图

```bash
studio-image gen --prompt '演唱会海报，霓虹灯，赛博朋克'
# ✅ stdout 输出: https://img.webkubor.online/xxx.png
```

就这么简单。第一张图就这么出来了。

---

### B 端 / CI 场景：用 apikey 代替登录

**这是租户走的路径**，跟上面平台用户的个人 login 是不同身份、不同鉴权：你在给自己的产品/服务接入出图能力，代表的是一个"服务"而不是某个登录的人，所以用 apikey，不需要也不应该用个人登录态。CI 环境同理（没有浏览器，走不了 login 那套授权）：

```bash
# 方式一：config 命令存到本地
studio-image config --apiKey sk-studio-xxx

# 方式二：环境变量（CI 友好，优先级最高）
export STUDIO_API_KEY=sk-studio-xxx
```

apikey（`sk-studio-<name>-<hex>`）从中台「租户管理」获取，适合脚本/服务长期使用。

---

## 完整用法

### 出图 `gen`

```bash
# 基本出图
studio-image gen --prompt '一只在月球上的猫'

# 宽高比（默认 3:4）
studio-image gen --prompt '海报' --ratio 9:16    # 可选: 3:4 / 9:16 / 1:1 / 4:3 / 16:9

# 指定模型（不指定则中台自动选最优）
studio-image gen --prompt '...' --model gpt-image-2

# 质量（仅 gpt-image 生效）
studio-image gen --prompt '...' --quality high

# 图生图（自动上传垫图，保持人物面容）
studio-image gen --prompt '保持面容，换成西装' --ref face.png

# 管道用法：拿到 URL 存变量
URL=$(studio-image gen --prompt '海报')
curl -o poster.png "$URL"
```

### 图片逆向 `reverse`

上传一张图，中台用 **SCULPT 六要素**（主体/构图/世界观/光影/输出/质感）逆推出图 prompt，可以直接拿去再出一张同风格的：

```bash
# 本地文件或图片 URL 都行
studio-image reverse photo.png
studio-image reverse https://example.com/photo.png

# 逆向 + 出图，一条龙
studio-image gen --prompt "$(studio-image reverse photo.png)"
```

分析详情打到 stderr（人看），**stdout 只输出英文 prompt**（机器用，方便管道）。

### 上传垫图 `upload`

```bash
studio-image upload face.png
# stdout: https://img.webkubor.online/refs/...
```

### 查模型 / 余额

```bash
studio-image models      # 中台当前可用的模型
studio-image balance     # 各上游余额
```

---

## 编程调用

CLI 背后是一个干净的 `StudioClient` class，也可以当库用：

```ts
import { StudioClient } from 'studio-image'

// 方式一：用 login 拿到的 token（个人用户）
const studio = new StudioClient({
  baseUrl: 'https://studio.webkubor.online',
  token: process.env.STUDIO_TOKEN!,  // 或从 ~/.studio-image.json 读
})

// 方式二：用 apikey（租户/B 端）
const studio2 = new StudioClient({
  baseUrl: 'https://studio.webkubor.online',
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
| `gen` | 出图 | 图片 URL |
| `reverse <file\|url>` | 图片逆向 | 英文 prompt |
| `upload <file>` | 上传垫图 | 图片 URL |
| `models` | 可用模型 | 模型名列表 |
| `balance` | 上游余额 | JSON |
| `config` | 配置中台（B 端 apikey） | — |

**stdout 只输出最终结果**，进度信息走 stderr——方便脚本和管道集成。

---

## 关于 studio 中台

[studio.webkubor.online](https://studio.webkubor.online) 是一个**出图能力中台**：聚合多家上游图像模型（gpt-image、豆包 Seedream 等），统一成一套 API 对外开放。

**它解决的问题**：

| 你不用管 | 中台替你做 |
|---------|-----------|
| 上游 key 的申请/充值/保管 | 密钥只在中心，永不下发 |
| 各家 API 格式差异 | 一套统一的 OpenAI 兼容接口 |
| 某家挂了/限流 | 自动路由 + 容错 + 降级 |
| 算成本/记账 | 每次调用自动记账，可查余额和用量 |
| 选哪个模型 | 默认自动调度，也可指定 |

**适合谁用**（对应本文最开始那张鉴权对照表）：

- **平台用户**：自己写自动化脚本/agent 需要命令行出图、个人多个项目想统一收口到一个能力服务——`studio-image login` 就够，不需要申请 apiKey
- **租户**：做 AI 产品的开发者，要把出图能力接进自己对外提供的产品/服务，不想碰上游细节——申请 apiKey，走服务端集成

**接入方式**：平台用户直接 `studio-image login`；租户到中台「租户管理」注册拿 apiKey，装上这个 CLI（或直接调 API）用 `config --apiKey` / `STUDIO_API_KEY` 配置。具体配额和计费见中台后台。

---

## License

MIT
