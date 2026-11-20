# museav speak —— 文字转语音

把一段文字合成成音频并落到本地文件，**stdout 只输出音频的绝对路径**，进度和说明走 stderr。

它是视频链路里独立的一步：文本先写好 → 念白合成 → 跟画面拼成片子。单独一条命令的意义是，
「这段话听着对不对」可以脱离整条片子先验收，而不是等片子渲完才发现念错字。

```bash
museav speak "第三集开始，雨水顺着屋檐落下来" --voice male-qn-qingse --out ./line1.mp3
# stdout: /abs/path/line1.mp3
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `museav speak "文本"` | 位置参数：要合成的文本 |
| `-t, --text <text>` | 同上，二选一 |
| `-f, --file <path>` | 从文件读文本（`-` 读 stdin） |
| `-v, --voice <id>` | 音色 ID（如 `male-qn-qingse`） |
| `-l, --language <lang>` | 语言，如 `zh` / `en` |
| `--format <fmt>` | `mp3`（默认）/ `wav` |
| `--speed <n>` | 语速，`1.0` 为常速 |
| `-o, --out <path>` | 输出文件；不给则落到 `./speech-<时间戳>.<格式>` |
| `--provider <name>` | `studio`（走中台，默认）/ `minimax`（直连上游） |
| `--model <name>` | 模型 / 音色档位 |
| `--overwrite` | 允许覆盖已存在的输出文件 |

文本只能给一处：位置参数 / `--text` / `--file` 三选一，给多处直接报错。

## 两条通道

### studio（默认）—— 走中台

请求 `POST /api/speak`，鉴权沿用中台那套（个人 `museav login` 的 JWT，或租户
`museav config --apiKey sk-studio-xxx`）。中台是唯一的 API 入口与计费口径。

> 中台的语音端点**曾随 MiMo Token Plan 退订下线**（`speak` / `transcribe` 一并清掉）。
> 中台还没重新开放时，这条通道会返回 404，CLI 会把这件事讲清楚而不是报一句天书。

### minimax —— 直连上游（绕过中台）

```bash
export MINIMAX_API_KEY=...        # 或 museav config --minimaxApiKey ...
museav speak "今天天气不错" --provider minimax --voice male-qn-qingse --out ./a.mp3
```

这条**不认中台身份、不扣中台 credits**，费用直接走 MiniMax 账单（按量计费）。
直连只出 mp3；要 wav 会用本机 ffmpeg 转成 24kHz 单声道（没装 ffmpeg 会明确报错，
不会给出一个「看起来成功」的假 wav）。

## 接入 muse·tv（reel-kit）

muse·tv 的配音链路在 `reel-kit/src/voice.mjs`，`--voice-engine museav` 这一档原来直接抛错。
接上 CLI 之后的形状是：

```bash
museav speak "$TEXT" --voice "$VOICE" --format wav --out "$OUT" --overwrite
# stdout 就是 $OUT 的路径
```

接线方案见 [`docs/patches/muse-tv-museav-speak.patch`](./patches/muse-tv-museav-speak.patch)
（该改动在 reel-kit 仓，本仓只给方案，不越界改别人的代码）。

## 失败时会看到什么

非零退出码 + stderr 上的中文说明，是本 CLI 唯一的失败信号：

| 情况 | stderr |
| --- | --- |
| 中台没开语音端点 | `中台还没有开放语音合成端点（POST /api/speak → HTTP 404）` |
| 没登录（走中台时） | `走中台的 speak 需要中台身份：museav login …` |
| 直连没给 key | `未配置 MiniMax API Key …` |
| 直连没给音色 | `MiniMax 直连必须指定 --voice <音色 ID>` |
| 输出文件已存在 | `输出文件已存在：…（要覆盖加 --overwrite）` |
| 文本给了多处 | `文本只能给一处：位置参数 / --text / --file 三选一` |
