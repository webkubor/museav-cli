---
name: ui-review-polish
description: Use when auditing, reviewing, or polishing an existing interface across visual hierarchy, accessibility, responsive behavior, motion, UX writing, color, and final product quality.
updated: 2026-06-03
last_used: ~
use_count: 0
---

> ## 🚦 UI 改动开工前置（硬性 · 先做再动手）
> 治「不读规范就动手」——本仓 UI/组件/样式任何改动，先按序做：
> 1. `cs flow frontend` → 拿到必读规则与禁止项
> 2. 读 `cs rule frontend_design_standard` + 本仓 `DESIGN.md`（圆角/颜色/组件/图标铁律）
> 3. **组件铁律**：主操作用 `Button variant="brand"`，禁止手写 `<button className="bg-brand-*">`；卡片用 `.mg-tile`，勿拿 `bg-mg-fill-0` 凑层次；圆角只用 `rounded-sm/md/lg/full`（**禁 `rounded-xl/2xl/3xl`**，它们是禁用刻度＝直角）；图标只用 `react-icons` 或 `@lobehub/icons`。
> 4. 提交前 UI 门禁 `scripts/ui-guard.sh` 会硬拦上述违规；**完成前必须浏览器验证**（engineering_baseline §4.2 结构化验收），禁止"没验就说完成"。

# UI Review Polish

Use this when the user says the UI is ugly, too AI-like, unclear, not polished, not responsive, too bland, visually noisy, or needs review before shipping.

## Decision Boundary

Choose this skill when:
- The main task is diagnosis, review, or targeted polish of an existing interface.
- You need to decide whether the fix is visual direction, layout, copy, motion, accessibility, color, or responsive behavior.
- The user asks for "review", "audit", "make it better", "高级感", "不好看", "太丑", "像 AI", "适配", "动效", "文案不清楚", or "打磨".

After diagnosis:
- If the screen is product/app UI inside a framework, apply `framework-product-ui`.
- If the screen is a public website or landing page, apply `css-website-design`.

## Review Order

1. Purpose: what should the user understand or do first?
2. Hierarchy: is the primary content/action visually dominant for the right reason?
3. Layout: spacing, alignment, grouping, density, card use, responsive constraints.
4. Typography: scale, weight, line length, label clarity, truncation, overflow.
5. Color: semantic roles, contrast, accent discipline, theme token usage.
6. Interaction: hover/focus/active/disabled/loading/error states, keyboard path.
7. Motion: only purposeful transitions; no bounce/elastic gimmicks.
8. UX writing: labels, errors, empty states, button text, duplicate copy.
9. AI slop scan: generic gradients, glassmorphism, glowing dark UI, decorative orbs, repeated icon cards, hero metric templates.

## Output Shape

For review-only tasks, lead with findings:
- Severity: P0/P1/P2/P3
- File or screen reference when available
- Problem and concrete fix

For implementation tasks:
- Make the smallest coherent polish pass that fixes the root visual issue.
- Verify layout at desktop and mobile sizes when a browser target exists.
- Mention any remaining design debt separately from completed fixes.
---
name: framework-product-ui
description: Use when improving or building product UI inside an existing component framework such as shadcn/ui, Radix, Ant Design, Naive UI, React Native Paper, or an internal design system. Keep the framework's component model and tokens as the source of truth.
updated: 2026-06-03
last_used: ~
use_count: 0
---

# Framework Product UI

Use this for app, SaaS, dashboard, console, admin, CRM, editor, mobile app, or repeated workflow UI when the project already has a UI framework or design system.

## Decision Boundary

Choose this skill when:
- The repo already uses a UI framework, component library, or design tokens.
- The work is inside an app workflow: tables, forms, filters, dashboards, settings, editors, detail pages, sidebars, modals, drawers, command palettes, toolbars.
- The main problem is information hierarchy, interaction density, component state, accessibility, or workflow efficiency.

Do not choose this for:
- Marketing websites, official sites, portfolio pages, brand landing pages, or editorial pages whose quality mostly comes from CSS composition. Use `css-website-design`.
- Pure review with no implementation direction. Use `ui-review-polish`.

## Operating Rules

1. Inspect the current component system first: package dependencies, existing components, CSS variables, theme tokens, layout primitives, and examples already in the repo.
2. Preserve the framework's semantics. Prefer existing Button, Input, Dialog, Select, Table, Tabs, Drawer, Toast, Menu, Tooltip, and Form components over custom HTML.
3. Design within product constraints: dense but readable layouts, predictable navigation, clear state, keyboard accessibility, responsive behavior, and fast repeated actions.
4. Use tokens and variants. Do not hardcode colors, spacing, or one-off styles unless the local system has no equivalent and the value is promoted into a token.
5. Avoid marketing-page composition inside tools. No oversized heroes, decorative card gardens, gradient-orb backgrounds, or nested cards for operational screens.

## Product UI Checklist

- Navigation: user can move between list, detail, edit, settings, and empty/error states without dead ends.
- Data density: tables, cards, and forms are scannable without looking sparse or cramped.
- Controls: use familiar controls for the job: segmented controls for modes, tabs for view switching, menus for option sets, switches/checkboxes for binary settings, sliders/inputs for numeric values.
- States: loading, empty, disabled, active, selected, error, success, and destructive states are visible and consistent.
- Responsive: compact layouts preserve primary actions and do not hide critical workflows.
- Accessibility: labels, focus states, keyboard paths, contrast, and hit targets are checked.

## Output Shape

When implementing, return:
- The design intent in one short sentence.
- The concrete components/paths changed.
- Any framework constraints kept or fixed.
- Verification run: build/typecheck/lint/browser check when available.
