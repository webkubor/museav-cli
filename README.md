[English](./README.en.md) | 中文

<h1 align="center">
  <img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/mark-v3.svg" width="96" alt="MUSE AV"><br>
  museav · 命令行出图中台
</h1>

<p align="center"><strong>一行命令出图，模型、密钥、路由、记账全不用你管</strong></p>

<p align="center">
  <a href="https://www.museav.top"><img src="https://img.shields.io/badge/MUSE%20AV-museav.top-ff6b35?style=for-the-badge" alt="MUSE AV"></a>
  <a href="https://www.npmjs.com/package/museav-cli"><img src="https://img.shields.io/npm/v/museav-cli?style=for-the-badge&color=%23cb3837" alt="npm version"></a>
  <a href="https://docs.museav.top/cli/"><img src="https://img.shields.io/badge/docs-%E4%B8%AD%E6%96%87%E6%89%8B%E5%86%8C-4c9a6b?style=for-the-badge" alt="文档"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/node-%E2%89%A520.19-339933?style=for-the-badge" alt="Node"></a>
</p>

---

## 它出的图长这样

这是用 `museav gen` 一行命令出的，**没有写英文提示词**：

<a href="https://www.museav.top/discover"><img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/gallery.webp" alt="灵感广场：museav gen 出的作品"></a>

<p align="center"><sub>上面这些都在 <a href="https://www.museav.top/discover">灵感广场</a> 里，点开能看到它用的模板和提示词 —— 挑中哪个，命令行也能直接调。</sub></p>

<img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/terminal.webp" alt="终端实拍：museav gen 出图">

## 为什么用它，而不是别的

| | **museav** | 直连 OpenAI / 豆包 API | Playwright 自动化网页 | 只用网页版 |
|---|---|---|---|---|
| **终端一行出图** | ✅ `museav gen "提示词"` | ⚠️ 自己管 SDK、签名、重试 | ❌ 得维护选择器，扛不住改版 | ❌ 要开浏览器 |
| **多模型自动路由** | ✅ 你只管写提示词 | ❌ 每家单独对接，挂了手动切 | — | ✅ |
| **中文技能库 104 个** | ✅ 服务端展开，不下发提示词 | ❌ 没有 | — | ✅ |
| **密钥不进代码** | ✅ 一次登录，7 天有效 | ❌ 明文躺在脚本里 | — | ✅ 浏览器登录态 |
| **额度与记账** | ✅ 中台自动记，看得到花在哪 | ❌ 自己算账单 | — | ✅ |
| **抠图/超分/去水印** | ✅ 本地免费，不花额度 | ❌ 另装一堆工具 | — | ✅ 网页编辑器 |
| **给 Agent 直接调** | ✅ stdout 只出结果，进度走 stderr | ⚠️ Agent 得自己拼请求 | ❌ 抗页面改版差 | ❌ 用不了 |

## 🚀 30 秒上手

```bash
npm install -g museav-cli
museav login                                          # 浏览器点一下批准
museav gen --skill ecom-main --input "米白色针织衫"    # stdout 出一张图的 URL
```

没有账号？[www.museav.top](https://www.museav.top) 用 Google / GitHub 一键登录，开放注册。

> 想先看看能出什么效果，再去 [灵感广场](https://www.museav.top/discover) 翻一翻 —— 不用注册也能看。

## 🎯 三种出图写法，挑一种

| 写法 | 什么时候用 |
| --- | --- |
| `--skill <技能名> --input "一句中文"` | **推荐。** 104 个调好的行业技能，提示词在服务端展开，你只写业务描述 |
| `--template <模板id> --fields '{"key":"值"}'` | 要可控、要省钱。确定性替换，不经模型 |
| `--prompt "英文提示词"` | 你自己会写提示词 |

```bash
museav skills --genre 电商                     # 先看这一分类有什么
museav gen --skill product-on-model --input "米白色针织衫" --ref ./模特图.jpg
```

带「需垫图」标记的技能必须加 `--ref`，本地文件会自动上传，不用先手动传一遍。

## 🔥 还能干什么

- **🎬 出视频** —— `museav gen --video`，文生视频/图生视频，首尾帧与多模态参考素材都支持
- **🖼 读图反推** —— `museav reverse ./图.jpg` 反推 SCULPT 六要素和提示词，跟出图串成一条龙
- **🧩 一张图变模板** —— `museav image-to-template ./海报.jpg`，读文字层 + 变量化 + 建成可复用模板
- **✂️ 本地后期，不花钱** —— `remove-bg` / `upscale` / `remove-watermark` / `compress`，免登录、不耗额度、Windows 也能跑
- **🏪 卖自己的东西** —— `museav shop` 建商品、建壁纸专题、发发货码
- **🤖 给 Agent 用** —— stdout 只输出最终结果（URL / JSON），进度走 stderr，直接管道

## 📚 文档

**这一页只讲「为什么」和「怎么开始」。全部命令和参数在文档站，那里跟着已发布版本实时更新，不会过期。**

| 你想做的 | 去哪 |
| --- | --- |
| 装上、三种身份、凭证放哪 | [装上并登录](https://docs.museav.top/cli/) |
| 全部命令一张表 | [命令速查](https://docs.museav.top/cli/commands) |
| 垫图、批量、指定比例这些成组配方 | [常见用法](https://docs.museav.top/cli/recipes) |
| 首尾帧、参考素材、IP 主体、本地抠图超分 | [视频与本地工具](https://docs.museav.top/cli/advanced) |
| 建商品、壁纸专题、发货码 | [经营自己的店铺](https://docs.museav.top/cli/shop) |
| 让 Claude Code / Codex 替你跑 | [给 Agent 用](https://docs.museav.top/cli/agent) · [AGENTS.md](./AGENTS.md) |
| 把出图、成片、SkillHub 串成一套 | [MCP](https://docs.museav.top/cli/mcp) |
| HTTP 接口、给产品做后端集成 | [API 概览](https://docs.museav.top/api/) |

<a href="https://docs.museav.top/cli/"><img src="https://cdn.jsdelivr.net/gh/webkubor/free-imgbed@main/museav-cli/docs.webp" alt="文档站"></a>

## 🧭 别用错地方

**这个 CLI 给「人在终端里」和「Agent 跑 shell 命令」两个场景用。**

做产品集成不要用它：Cloudflare Workers / Pages Functions 这类边缘运行时**起不了子进程**，
`museav` 二进制在那种环境根本跑不起来。那种场景二选一：

- 后端程序化调用 → 直接 `fetch('https://manager.museav.top/api/generate', { headers: { 'X-API-Key': ... } })`
- 当库用 → `import { StudioClient } from 'museav-cli'`

```ts
import { StudioClient } from 'museav-cli'

const studio = new StudioClient({ baseUrl: 'https://manager.museav.top', apiKey: process.env.MUSEAV_API_KEY! })
const job = await studio.generateAndWait({ prompt: 'a cat on the moon', ratio: '3:4' })
console.log(job.cdn_url)
```

**要出成品竖版视频也不是它。** `gen --video` 给你的是无声无字幕的原料，
装配成能直接发的成片是 [reel-kit](https://github.com/webkubor/reel-kit) 的活：

```bash
reel make --assets ./图片目录 --caps 文案.txt --title "标题" --bgm 儿童轻快 --out 成片.mp4
```

典型链路：`museav gen` 出图 → `museav remove-bg` 抠图 → `reel make` 出片。

## 🤝 兼容的 Agent

[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-6366f1?style=for-the-badge)](./AGENTS.md)
[![Codex](https://img.shields.io/badge/Codex-compatible-10a37f?style=for-the-badge)](./AGENTS.md)
[![Hermes](https://img.shields.io/badge/Hermes-compatible-f2a65a?style=for-the-badge)](./AGENTS.md)
[![Antigravity](https://img.shields.io/badge/Antigravity-compatible-8b5cf6?style=for-the-badge)](./AGENTS.md)

它天生适合被 Agent 代跑：没有向导菜单、没有 `y/N` 确认、stdout 只出可解析结果、
凭证走环境变量不落盘。细节见 [AGENTS.md](./AGENTS.md)。

## 📦 从旧版迁移

产品叫 MUSE AV，命令以前却叫另一个名字。现在统一了：

```bash
npm uninstall -g @kubor/studio-cli   # 卸掉旧包，不然两个命令并存
npm install -g museav-cli            # 新包，命令名是 museav
```

- 脚本里的旧命令换成 `museav xxx`，参数和行为一模一样
- 旧配置 `~/.studio-cli.json` **仍会自动读取**，不用重新登录；下次写入时落到 `~/.museav.json`
- `STUDIO_API_KEY` / `STUDIO_BASE_URL` 继续有效，新增等价的 `MUSEAV_API_KEY` / `MUSEAV_BASE_URL`（新名优先）
- 当库用：`import { StudioClient } from 'museav-cli'`（类名不变）

## 🔧 发布（维护者）

CI 接管发布，本机不要 `npm publish`：推 `v*` tag 触发
`.github/workflows/publish.yml`，走 Trusted Publishing(OIDC)，不需要 NPM_TOKEN 也不需要 OTP。

四者必须一致，差一个就红：`CHANGELOG` 顶部版本 == `package.json` 的 `version` == `git tag` == `museav --version`。

## License

[MIT](./LICENSE)

---

<p align="center"><sub>底层中台 <a href="https://www.museav.top">MUSE AV</a> · API <a href="https://manager.museav.top">manager.museav.top</a> · 文档 <a href="https://docs.museav.top">docs.museav.top</a></sub></p>
