# 标准样板（How）

> 写新页面/新模块前：**先挑一个最像的现有页当参照**，照它的结构+组件组合排——布局排版的真源是现状控制台，不是 PRD 原型的视觉。

## 参照页表（按你要做的东西找同类）

| 要做的形态 | 参照页 | 结构骨架 |
|---|---|---|
| 列表管理页 | `src/pages/api-keys/` | `space-y-6` → PageHeader → KpiCard 行 → 工具条（搜索/筛选/主按钮）→ Table → Pagination；详情/创建用 SideSheet，轻编辑用 Modal |
| 多 scope 分区页 | `src/pages/guardrails/` | KpiCard 行 → 按 scope 分 section 卡，各带搜索+Table；配置走 SideSheet 三合一 |
| 数据分析页 | `src/pages/usage/` | PageHeader + SegmentedToggle 切视图 → 筛选+统计卡+趋势图（Recharts）→ 分布明细卡 |
| 日志/流水页 | `src/pages/logs/` | PageHeader + 双 SegmentedToggle → 筛选区 + Table + 分页；行详情 SideSheet |
| 卡片网格页 | `src/pages/workspaces/` | PageHeader → 摘要条 → 操作区 → Card 网格 → 分页；选中内联展开 Tabs |
| 看板首页 | `src/pages/dashboard/` | 无 PageHeader；Greeting + 指标卡（KpiCard 套 TiltCard）+ 趋势/排行 |
| 沉浸式工作台 | `src/pages/models/`（体验） | 独立 css + 两栏；弹层用 ModelPickerDialog 模式（锚定浮层/居中 modal 按 PRD 形态二选一） |

模块级字段文案+角色差异（谁能看什么）：`docs/ui-reference/<module>.md`（现有 api-keys、guardrails；做别的模块建议先补一份再动手）。

## 样板一：Service + Hook + 页面 三段式

```ts
// 1. src/services/foo.ts —— 只做 HTTP，类型进 src/types 或 src/interfaces
import { get, post } from '@/lib/request'
export function listFoo(params?: FooListParams) {
  return get<CursorPage<FooItem>>('foo', params)   // 相对路径，request 层拼 /api/v1
}

// 2. src/features/foo/hooks/useFoo.ts —— React Query 封装，staleTime 按数据频率
export function useFoo(params?: FooListParams) {
  return useQuery({ queryKey: ['foo', params], queryFn: () => listFoo(params), staleTime: 60_000 })
}

// 3. 页面 —— 只消费 hook，空态/加载/错误三态齐全
const { data, isLoading } = useFoo()
const items = data?.items ?? []
```

要点：兼容 CursorPage/数组两种返回用 `pageItems<T>()`；错误不 toast 原始报错，走统一错误层。

## 样板二：列表页骨架

```tsx
<div className="space-y-6">
  <PageHeader title={t('foo.title')} description={t('foo.desc')} />
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <KpiCard label={...} value={...} />
  </div>
  <div className="mg-tile p-4">{/* 工具条：搜索 + 筛选 + <Button variant="brand"> */}</div>
  <Table>...</Table>
  <Pagination ... />
  <FooDetailSheet open={...} />   {/* SideSheet：查看/创建；Modal：轻量编辑/确认 */}
</div>
```

## 样板三：弹层选型

| 场景 | 组件 | 依据 |
|---|---|---|
| 详情/多字段创建 | `SideSheet` | 右滑抽屉，PRD 原型多为此形态 |
| 轻编辑/二次确认 | `Modal` / `ConfirmModal` | 居中小窗 |
| 删除等破坏性操作 | `ConfirmModal` 红色确认 | 必须二次确认 |
| 锚定选择器 | Popover/自定位浮层 | 形态跟 PRD：换模型=锚定浮层，添加对比=居中 modal |

## 样板四：空态/错误/权限三件套

```tsx
if (!hasPermission) return null                      // 无权限：入口不存在
if (!isLoading && items.length === 0) return <EmptyState ... />  // 空态引导，不是报错
// 接口 40401 → 统一「服务暂不可用」，不留死按钮
```
