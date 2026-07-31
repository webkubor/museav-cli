# mg-frontend-skill 已迁移至公司 skill 仓

真源：**`shared/ai-skills` → `dev/frontend/mg-frontend/`**（含 SKILL.md 主入口 + references/ 八份）。

安装到本地 agent（Claude Code / Codex 通用）：

```bash
npx git+ssh://git@gitlab.ops.modelgo.com/shared/ai-skills.git -- --skill mg-frontend
```

本目录不再保存内容副本（一个事实一个真源，避免两仓漂移）。skill 引用的仓内真源仍在原处：`DESIGN.md`、`docs/ui-reference/`、`docs/COLLABORATION.md`、`scripts/ui-guard.sh`。
