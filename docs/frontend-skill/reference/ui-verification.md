# UI 自动化验证（ego-lite）—— 完成的定义（DoD）

> **「没验就说完成」是本仓明令禁止项**。tsc/build/lint 全绿 ≠ 完成；完成 = 浏览器里看到正确行为 + 证据（截图/探针读数）。

## 工具分层（能低层解决不上高层）

| 层 | 工具 | 什么时候用 |
|---|---|---|
| API 层 | `console-automation/mg-login.mjs`（零浏览器） | 验数据/契约/角色可见范围：`node mg-login.mjs <account> --get "/xxx"`，`--switch-tenant <tid>` 切角色视角 |
| UI 层 | **ego-lite（ego-browser）**：AI 专属隔离空间、复用登录态 | 看页面/点交互/截图。任何 UI 改动的验证首选 |
| 一条命令 | `console-automation/mg-verify.sh <account> <path> [js-probe]` | 角色化 UI 验证一步到位：登录→注入 cookie→**清 SW 缓存**→硬刷→导航→截图→JS 探针 |

测试账号在 `console-automation/accounts.json`（owner-static / ws-owner-230 / qa-test01），**先查现成角色，别现建**。

## ego-lite 标准流程（heredoc 模板）

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('verify <改动名>')   // 任务空间跨轮复用
await openOrReuseTab('http://localhost:5175/<页面>', { wait: true, timeout: 30 })
await wait(3)
// 观察：snapshotText()（语义树+ref）或 js()（DOM 探针，读文案/尺寸/计算样式最快）
const state = await js(String.raw`(() => ({
  visible: !!document.querySelector('.目标元素'),
  color: getComputedStyle(document.querySelector('.目标元素')).color,
}))()`)
cliLog(JSON.stringify(state))
// 交互：click('@ref' 或 CSS 选择器) / fillInput / pressKey / uploadFile
const shot = await captureScreenshot()   // 截图用 Read 工具肉眼确认（视觉 DoD 硬要求）
cliLog(shot)
EOF
# 收尾必须关空间，否则进程堆积：
# await completeTaskSpace(task.id, { keep: false })
```

实战要点（都是踩过的坑）：
- **PWA 会缓存旧 bundle**：验测试环境先处理「新版本已发布」弹窗（点立即更新）或用 mg-verify.sh（内置清 SW），否则会拿旧代码误判「没修」；
- Radix Tabs 等组件 DOM `.click()` 不生效，要么用 ego 的 `click()`（真实事件），要么补发完整指针事件序列（pointerdown→mousedown→focus→pointerup→mouseup→click）；
- 弹层内列表点不中 = 元素在内部滚动区外，先搜索过滤缩短列表再点；
- `@N` ref 只对最近一次 snapshotText 有效，跨轮用 CSS 选择器。

## 验证清单（交付前逐项打勾）

- [ ] **真实数据**：用有数据的账号看到实际结果（空态/URL 变了/agent 说 OK 都不算过）
- [ ] **双主题**：`document.documentElement.setAttribute('data-theme','dark'/'light')` 各验一遍
- [ ] **双分支对照**（修 bug 时）：未修复分支能复现 + 修复分支不复现，只跑修复侧不算证据
- [ ] **窄视口**（布局改动时）：`cdp('Emulation.setDeviceMetricsOverride', { width: 1344, ... })`
- [ ] **角色差异**（权限相关时）：owner/member 各验（mg-verify.sh 换 account）
- [ ] **截图留证**：回 GitLab 单必须带真实截图（含「判定不是 bug」的结论）

## 验证后的流转

修完 → 部署到**发现问题的环境**（默认 test：合 `test` 分支 → push → Jenkins `test/modelgo-console-web`）→ 用 version.json 带时间戳确认 commit hash 到位 → **在部署后的环境复验** → GitLab 单贴 版本号+根因+截图 → 转「待验证」。顺序不可颠倒：先部署再改单状态。
