/**
 * 「查看赠金」的定位判定 —— 单拎一个模块，不放 BillingLedgerPanel.tsx：
 * 组件文件里导出非组件会破 react-refresh 规则（eslint 直接报错），而这段逻辑要单测。
 */

import type { IncomeRecord } from '@/services/billing'

/**
 * 「查看赠金」要高亮的是哪一行（新手奖励领取回执 → 入账记录，规格 2026-08-13）。
 *
 * ⚠️ **交叉比对，不要退回成「某个字段配某个字段」**。两边各有两个标识，而哪个配哪个
 * 取决于列表当下的数据来源：
 *   · claim 回执：`transaction_id` 与 `record_ref`
 *   · 列表行：`id` 与 `record_ref`（展示编号 `redm_<日期>_<id 后 8 位>`）
 * 走 income-records 真接口时，行 id 是赠金流水 id；走当前的前端合成回落时，行 id 与
 * record_ref 都是赠金流水 id。写死某一对，换个数据源就静默失配 —— 表现是「点了查看
 * 赠金，跳过去了但没有任何高亮」，页面不报错、控制台也没有线索，极难查。
 * 两个都是不会撞车的长 id，交叉比对没有误伤风险。
 */
export function isHighlighted(
  rec: IncomeRecord,
  highlight: { recordRef: string; transactionId: string } | null,
): boolean {
  if (!highlight) return false
  const wanted = [highlight.transactionId, highlight.recordRef].filter(Boolean)
  return wanted.some((value) => value === rec.id || value === rec.record_ref)
}
