# 开发日志说明（log/）

仅本地开发产生，`*.log` 不入库。**每次 `pnpm dev` 启动清空**，保证看到的是本次会话。

## 3 类实时调试流（排查问题按这个顺序）

| 文件 | 内容 | 何时看 | 谁写 |
|------|------|--------|------|
| **api-calls.log** | 全部 API（成功+失败）+ 路由跳转，带完整请求/响应体 | 查接口契约、定字段、看调用顺序 | `scripts/dev-logger-plugin.ts`（前端 → `POST /dev/log`） |
| **dev-errors.log** | API 失败（code≠0）+ 前端运行时错误（uncaught / rejection / console.error） | 只看"哪坏了" | 同上 + `src/lib/dev-error-reporter.ts` |
| **proxy.log** | 代理层 header 真相：请求带的 **Cookie**、响应的 **Set-Cookie 属性**、status | 查 cookie / 网络层——前端 fetch 看不到的（Domain、Secure、SameSite、HttpOnly、302） | `vite.config.ts` 的 proxy `configure` |

> 字段排查先看 `api-calls.log` 的真实响应，别凭类型猜（历史教训：`actual_cost` 实为 `final_amount`）。

## 派生 / 非实时（不属上面 3 类）

- **dev-server.log** —— vite 进程 stdout/stderr，由 `cs dev` 包装落盘（启动报错、build 错看这）。
- **triage.log** —— `scripts/dev-bug-triage.mjs` 读上面日志生成的"噪声 vs 待修"分类报告。

## 典型案例：登录成功却一直 401（cookie 存不住）

`api-calls.log` 看到 `POST auth/login code=0` 紧跟 `GET auth/session code=40101`，
=> 去 `proxy.log` 看那条 session 请求的 `Cookie(req)`：若为 `无`，说明浏览器没存住登录下发的 cookie。

根因：上游 cookie 是 `Domain=test.modelgo.com（父域）; Secure; SameSite=None`，
而本地是 `http://localhost` —— 域不匹配 + Secure 在 http 被丢弃 → 拒收。

修复在 `vite.config.ts` proxy `configure`：开发态对 Set-Cookie **去 Domain（变 host-only）、剥 Secure、SameSite=None→Lax**。
（测试/生产是 https 同域，cookie 正常，此改写只在 dev 生效。）
