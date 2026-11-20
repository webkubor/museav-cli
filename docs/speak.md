# museav speak —— 文字转语音

把一段文字合成成音频并落到本地文件，**stdout 只输出音频的绝对路径**，进度和说明走 stderr。

它是视频链路里独立的一步：文本先写好 → 念白合成 → 跟画面拼成片子。单独一条命令的意义是，
「这段话听着对不对」可以脱离整条片子先验收，而不是等片子渲完才发现念错字。

```bash
export MINIMAX_API_KEY=...        # 或 museav config --minimaxApiKey ...
museav speak "第三集开始，雨水顺着屋檐落下来" --voice male-qn-qingse --out ./line1.mp3
# stdout: /abs/path/line1.mp3
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `museav speak "文本"` | 位置参数：要合成的文本 |
| `-t, --text <text>` | 同上，二选一 |
| `-f, --file <path>` | 从文件读文本（`-` 读 stdin） |
| `-v, --voice <id>` | 音色 ID（如 `male-qn-qingse`）。**必填** |
| `-l, --language <lang>` | `zh` / `en`；不给就让上游自己判断 |
| `--format <fmt>` | `mp3`（默认）/ `wav` |
| `--speed <n>` | 语速，`1.0` 为常速 |
| `-o, --out <path>` | 输出文件；不给则落到 `./speech-<时间戳>.<格式>` |
| `--model <name>` | 上游模型档位，默认 `speech-02-hd` |
| `--overwrite` | 允许覆盖已存在的输出文件 |

文本只能给一处：位置参数 / `--text` / `--file` 三选一，给多处直接报错。

## 通道只有一条：直连上游

`museav speak` 直连 MiniMax 官方 TTS（`POST https://api.minimaxi.com/v1/t2a_v2`）。
它**不认中台身份、不扣中台 credits**，费用直接走你自己的 MiniMax 账单（按量计费）。

### 为什么不是走中台

截至 2026-11-20，中台**没有**语音合成端点：中台的语音协议层随小米 MiMo Token Plan
退订时一并删掉了，现网请求 `/api/speak`、`/api/tts`、`/api/speech`、`/api/audio`
一律返回 405（路由不存在，与随便编一个路径的反应一样）。所以文档里**不写任何
"中台契约"**——猜出来的路径和字段会被后人当成正式接口来读，那比没有更糟。

中台若重新接入语音（要不要接、按什么口径计费，都由 owner 拍板），届时会以正式契约
为准补进本文档和命令参数；在那之前，`--provider studio` 会直接告诉你现状并退出。

### 上游契约（2026-11-20 实测复核）

请求体：

```json
{
  "model": "speech-02-hd",
  "text": "要念的句子",
  "stream": false,
  "language_boost": "Chinese",
  "voice_setting": { "voice_id": "male-qn-qingse", "speed": 1, "vol": 1, "pitch": 0 },
  "audio_setting": { "sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1 }
}
```

- 鉴权头 `Authorization: Bearer <MINIMAX_API_KEY>`。
- HTTP 200 **且** `base_resp.status_code` 为 0 才算成功——带 `base_resp` 不等于失败。
- 音频在 `data.audio`，是 **hex 字符串**（不是 base64，也不是直链），CLI 解码后落盘。
- `language_boost` 只在给了 `--language` 时才发（上游自己会按文本判断语言）。

## 接入 muse·tv（reel-kit）

muse·tv 的配音链路在 `reel-kit/src/voice.mjs`，`--voice-engine museav` 这一档原来直接抛错
（"中台的 CLI 里没有 speak 命令"）。接上 CLI 之后的形状是：

```bash
museav speak "$TEXT" --voice "$VOICE" --format wav --out "$OUT" --overwrite
# stdout 就是 $OUT 的路径
```

### 已经落地了

接线在 reel-kit 仓（远端 `museav-ai/muse-tv`）落到了分支 `feat/museav-speak-voice`、
commit `ace4666`，**尚未合并 main**，等评审。落地版比本仓原先给的方案多补了三点，
都是跑起来才暴露的坑：

- 音色给默认值 `male-qn-qingse`（`speak` 必填 `--voice`，不给会让整条链路因为一个
  可省参数挂掉；可用 `REEL_MUSEA_VOICE` 覆盖）；
- 显式透传 `MINIMAX_API_KEY`——CLI 只认自己的 `~/.museav.json`，而 reel-kit 的密钥在
  `~/.reel-kit/config.json`，不透传就是「配了却不认」；
- 失败时报到具体第几句，并提示需要 museav-cli 3.17.0+。

接线方案（纯 unified diff，`git apply -p1` 落到 reel-kit 仓根目录）同步在
[`docs/patches/muse-tv-museav-speak.patch`](./patches/muse-tv-museav-speak.patch)，
内容与实际落地的 `ace4666` 一致。该改动在 reel-kit 仓，本仓只给方案、不越界改别人的代码。
落地版认三个环境变量：

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `MUSEA_BIN` | `museav` 可执行文件的绝对路径（桌面版从 Finder 启动时 PATH 很干净） | `museav`（走 PATH） |
| `REEL_MUSEA_VOICE` | 音色 ID | `male-qn-qingse` |
| `MINIMAX_API_KEY` | MiniMax key；不设则回落到 `~/.reel-kit/config.json` 的 `minimaxApiKey` | — |

### 还没打通的两处

- **CLI 要先发版**：3.17.0 还没发 npm，`museav speak` 目前只有本地构建可用。
- **桌面版打包资源要刷新**：桌面版内置的 museav-cli 还是 3.16.0，CLI 发版后要跑
  reel-kit 的 `scripts/prepare-resources.sh` 重新打包，Reel Studio 里才能直接用这个后端。

## 要 wav，就一定拿到 wav

`--format wav` 说的是「我要 wav」，但上游回什么是上游的事。所以 CLI 拿到字节后
先看它自己是不是 wav（`RIFF`/`WAVE` 头），不是就转一道，而不是改个后缀糊弄你：

- 上游只出 mp3 → 本机 ffmpeg 转成 24kHz 单声道 16bit；
- 本机没有 ffmpeg → **在调用上游之前**就报错退出，不会先把可能计费的调用跑掉再失败。

## 失败时会看到什么

非零退出码 + stderr 上的中文说明，是本 CLI 唯一的失败信号：

| 情况 | stderr |
| --- | --- |
| 指定了走中台 | `中台没有语音合成端点：…（默认就是 --provider minimax）` |
| 没配 MiniMax key | `未配置 MiniMax API Key …` |
| 没给音色 | `MiniMax 直连必须指定 --voice <音色 ID>` |
| 语言不认 | `--language 只支持 zh / en` |
| 上游拒绝 | `MiniMax 拒绝请求（<code>）：<原因>` / `MiniMax HTTP <status>` |
| 输出文件已存在 | `输出文件已存在：…（要覆盖加 --overwrite）` |
| 文本给了多处 | `文本只能给一处：位置参数 / --text / --file 三选一` |

## 验证

```bash
npm test
```

speak 的用例是真跑：起一个本地假上游 → 真的 CLI 子进程 → 真的 HTTP 往返 → 真的文件落盘，
再核对 stdout 是不是路径、落盘的是不是那段字节、请求体字段对不对、错误路径的退出码对不对。
中台那一侧**不 mock**——中台没有语音端点，没有契约可 mock，测一个不存在的契约
只会把幻觉固定下来。

## 真实调用：命令、权限与消耗（等 owner 点头再跑）

下面这条是**真花钱**的调用。跑之前需要 owner 明确点头。

```bash
# key 来源二选一：环境变量（CI / agent 注入）或 ~/.museav.json（权限 0600）
export MINIMAX_API_KEY=sk-xxx
# 或： museav config --minimaxApiKey sk-xxx

museav speak "第三集开始，雨水顺着屋檐落下来" \
  --voice male-qn-qingse --out ./line1.mp3
```

- **所需权限**：一把 MiniMax 账号 key，只需要 TTS 合成能力。不碰中台身份，不扣中台
  credits，也不需要中台管理员权限——这条通道**绕过中台**，账单直接落在 MiniMax。
- **预计消耗**：按 MiniMax 官方按量价，`speech-02-hd` 约 **$1.00 / 1 万字符**
  （`speech-02-turbo` 约 $0.60 / 1 万字符）。一句话 30 字大约 $0.003。
  来源：[MiniMax 按量价页](https://platform.minimax.io/docs/guides/pricing-payg)（2026-11-20 检索，
  未在官方页面上二次复核，下单前请以官网为准）。本 CLI 默认档位是 `speech-02-hd`，
  要更省可以 `--model speech-02-turbo`。

## 一个待 owner 拍板的问题

CLI 的定位是「中台 API 客户端 + 一套本地图像后期工具」。`speak` 直连上游，
在定位上算是**第一次由 CLI 自己直接调一个非中台的服务**（红线①「不内置模型运行时」
和红线②「不寄生第三方工具」说的是本地推理与无关能力的寄生，直连 TTS 不落在那两条上，
但它确实改变了「中台是唯一 API 入口」这件事）。

这一点已经同步给中台主理人（墨图），他没有异议，但按规矩要 owner 拍板：
CLI 是否允许「绕过中台直连上游」这一类通道。在 owner 表态之前，命令按现状可用，
文档已把「不扣中台 credits、费用走 MiniMax 账单」写在明处。
