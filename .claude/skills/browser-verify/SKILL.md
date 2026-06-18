---
name: browser-verify
description: Use when you need to control a real browser or visually verify rendered UI (screenshot, read on-screen values, click, check light/dark/mobile, diagnose blank/empty pages). Built on browser-harness (CDP), works cross-agent. Use for any UI visual DoD / "看渲染 / 截图验证 / 浏览器控制".
---

# 浏览器控制 / UI 可视化验证（browser-harness）

跨 Agent 的浏览器控制能力，依赖 **`browser-harness`**（CDP 直控本机 Chrome）。它是命令行工具，Claude / Codex / Gemini 都能 shell 调用——不绑定某个 Agent 专属的浏览器 MCP，所以跨 Agent。

## 何时用

- **UI 改动的视觉验收（DoD）**：亲眼看渲染（明暗 / 移动宽度），不靠猜。**线上改动要看部署后的真实环境（test/prod），不是只看 localhost。**
- **排查「空白 / 没数据」**：区分是数据问题还是渲染问题（先看接口/日志，再看渲染）
- 确认交互、布局、配色的实际效果

## 调用形态（heredoc，python 内核）

内网 / 本地一律带 `NO_PROXY` 防 Clash 劫持：

```bash
NO_PROXY=127.0.0.1,localhost browser-harness <<'PY'
new_tab("http://localhost:5173/dashboard")   # 首次导航用 new_tab；别用 goto（会抢用户当前标签页）
wait_for_load()
import time; time.sleep(2)                    # SPA 数据异步，留一点渲染时间
p = capture_screenshot()                      # 截图落 /tmp/shot.png，再用 Read 工具看图下结论
print("SHOT:", p)
PY
```

- **读 DOM 文本/值**：`js("(()=>{ ...return 字符串... })()")`——比截图快，适合核对具体数值/文案
- **点击**：先截图读坐标 → `click_at_xy(x, y)` → 再截图验证（命中走 Chrome 合成层，穿透 iframe/shadow）
- **滚动到元素**：`js("document.querySelector('.sel')?.scrollIntoView({block:'center'})")`
- **输入**：`type_text("...")` / `press_key("Enter")`

## modelgo 专属注意（项目级，所以放在本项目团队 skill 里，不写进通用 cs）

- **端口**：dev 是 `http://localhost:5173` 或 `5175`（看实际：`cs ports`）
- **线上环境**：测试 `console.test.modelgo.com`；改动部署后**在这里实测**，别只看 localhost。看不到新内容先排除浏览器缓存（硬刷新）+ 确认 JS bundle hash 已更新
- **登录墙**：用 QA 账号（`cs secrets`）或复用 Chrome 已登录会话；被重定向到 `/login` 就停下问人，**别从截图填密码**
- **页面空白先看 `log/`**（`errors.log` / `api-calls.log`）：后端 503 会让整页空白，那是环境不是前端 bug
- **截图后必须用 Read 工具看图再下结论**——别裸报「渲染正常」（视觉 DoD 硬要求）

## 完整工具参考

`~/Developer/browser-harness/SKILL.md`：`new_tab` / `wait_for_load` / `page_info` / `capture_screenshot` / `js` / `click_at_xy` / `type_text` / `press_key` 等；远程/并行（多 sub-agent 各自独立浏览器）见其 `interaction-skills/` 与 remote daemon 章节。
