/**
 * 账单模块埋点分桶工具（PRD 1.0.4 §11.2，qa#542）
 * `_band` 后缀属性是分桶值，不是原始金额/数量，避免上报敏感原始数字；
 * 区间为工程经验值（PRD 未给出具体边界），风格对齐 model-experience-data.tsx 的 latencyBucket 等。
 */

/** 金额分桶（balance_total_band / amount_band / threshold_band 等共用） */
export function amountBand(amount: number | string | undefined | null): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (n === undefined || n === null || !Number.isFinite(n)) return 'unknown'
  if (n < 100) return '<100'
  if (n < 1000) return '100-1000'
  if (n < 10000) return '1000-10000'
  return '>10000'
}

/** 数量分桶（order_count_band / invoiceable_order_count_band 共用） */
export function countBand(count: number | undefined | null): string {
  if (count === undefined || count === null || !Number.isFinite(count)) return 'unknown'
  if (count <= 0) return '0'
  if (count <= 5) return '1-5'
  if (count <= 20) return '6-20'
  return '>20'
}
