# 硬性约束（Don't / Why）

> MUST / MUST NOT，每条带理由。机器门禁 `scripts/ui-guard.sh` 会硬拦其中大部分——**违规提交不进仓**。
> 视觉细则真源是仓根 `DESIGN.md`，本文不复述数值，只列规则与理由。

## 组件与样式

| # | 规则 | Why |
|---|---|---|
| 1 | **MUST** 主操作用 `<Button variant="brand">`；**MUST NOT** 手写 `<button className="bg-brand-*">` | 按钮态（hover/disabled/loading）与双端品牌色都封装在组件里，手写必漏态、必漂移 |
| 2 | **MUST** 卡片用 `.mg-tile` 或 `<Card>`；**MUST NOT** 用 `bg-mg-fill-0` 凑层次 | 卡片语言=实心 bg-0+淡边框+柔和阴影（Apple 系），fill 是控件填充色不是容器色，混用层次即乱 |
| 3 | **MUST** 圆角只用 `rounded-sm/md/lg/full` | `xl/2xl/3xl` 是禁用刻度（渲染为直角），刻度值由 design-tokens 统一，乱用=视觉断层 |
| 4 | **MUST** 颜色走 token（`--mg-*`/`--brand-*`）；**MUST NOT** 硬编码 hex（例外：green/red/yellow 语义状态色、box-shadow rgba） | 深浅主题+国内/海外双品牌全靠 token 解析，写死 hex 在另一主题/市场下必错 |
| 5 | **MUST** 图标只用 `react-icons` / `@lobehub/icons`；模型身份必须 `<ModelIcon>` | 统一视觉密度与授权审计；手写首字母色块与全站模型识别不一致 |
| 6 | **MUST** 每页用 `<PageHeader>`，**MUST NOT** 传 `className="mb-0"` 之类覆盖间距 | 标题到首卡间距由组件+外层 `space-y-6` 统一管，5 个页面私改曾导致全站标题贴卡返工 |
| 7 | **MUST** 毛玻璃只给浮层（弹窗/下拉），页面容器一律实心 | 玻璃叠玻璃可读性崩坏，这是本仓卡片语言的底线 |

## 数据与契约

| # | 规则 | Why |
|---|---|---|
| 8 | **MUST NOT** 前端造假标签兜底缺失字段（如「未知XX」）；显「—」并给后端提单 | 假标签掩盖数据缺陷，让后端问题永远修不了 |
| 9 | **MUST NOT** 前端 join 别的列表凑后端没给的字段 | 多余请求+语义耦合；正确做法是落 API 单让后端补 |
| 10 | **MUST** 消费新接口前先打 Swagger/实调确认存在 | 看板状态≠test 可用，曾有「待验证」单实际路由 404 |
| 11 | **MUST** 会话/配置类键名对齐后端契约（snake_case，如 `system_prompt`） | 后端透明存储不校验键名，写错键=静默丢弃、存成功≠生效 |
| 12 | **MUST** 模型体验类别/任务用 `modelExperienceTasks`/`resolveModelCategory` 推导，**MUST NOT** 读 `experience_types`（已废弃删除） | 口径 2026-07-31：input/output_modalities 是唯一真源，「暂未开放」=推导为空 |

## 交互与权限

| # | 规则 | Why |
|---|---|---|
| 13 | **MUST** 无权限=隐藏入口；有权限没数据=空态引导；只有 PRD 明确的互斥项才置灰 | 隐藏是默认、置灰是例外——置灰暗示"可以有"，误导用户 |
| 14 | **MUST NOT** 留死按钮/悄悄隐藏未就绪入口；接口 40401 统一提示「服务暂不可用」 | 死按钮伤信任；错误归一在错误层不在每个调用点 |
| 15 | **MUST NOT** 把 provider/网关原始英文报错透传给用户 | 已有关键词分类映射转中文友好文案（`model-experience-data.tsx`），原始串进 console.error |
| 16 | **MUST** 弹层形态跟 PRD 原型（抽屉就抽屉、居中就居中），视觉样式跟现状控制台 | 形态是产品定义、样式是体系定义，两个真源别搞反 |

## 流程

| # | 规则 | Why |
|---|---|---|
| 17 | **MUST** 任何代码改动先开隔离 worktree（`git worktree add -b fix/<名> ../wt-<名> origin/test`），**MUST NOT** 直接在主检出 test 分支写码 | 本仓常年多 agent/session 并发，直接改主检出=撞车（2026-07-29 真实事故） |
| 18 | **MUST** UI 改动完成前用浏览器实测（见 [ui-verification.md](./ui-verification.md)），tsc/build 绿不算完成 | 「没验就说完成」是本仓明令禁止项 |
| 19 | **MUST** 深/浅双主题各验一遍再交付 | token 在两主题解析不同，单主题验证漏一半（账单黑字事故：浅色碰巧成立、深色不可读） |
| 20 | **MUST** 全局样式（`ui/*`、共享 css）改动前 grep 全部消费方 | 全局 `flex:1` 曾为修对比页误伤单模型页布局 |
