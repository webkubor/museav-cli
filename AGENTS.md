# AGENTS.md — Agent 冷启动入口（Codex / GPT / Gemini / 任意 CLI）

> **唯一入口**：`PROJECT-BRIEF.md`
> 本文件只做指针，不重复内容。详细规则统一走 PROJECT-BRIEF.md。

## 开工三步

```bash
# ① 读项目快照
cat PROJECT-BRIEF.md

# ② 读协同 SOP
cat docs/COLLABORATION.md

# ③ 读全局规则（按需）
cs rule agent_governance
cs rule coding_conventions
cs rule engineering_baseline
```

## 协同

详见 `docs/COLLABORATION.md`

## 真源

- 接口 → Swagger `https://modelgo-web-api.test.modelgo.com/swagger/doc.json`
- 功能/交互 → PRD 原型 `@modelgo-prd/src/App.tsx`（`cs path` 查路径）
- UI 方向 → 现状控制台代码（不对标原型视觉）
- 命名 → PRD 原型（租户/工作空间，非组织/项目）
