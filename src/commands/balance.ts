/** museav balance —— 查租户余额（¥，实时计算：充值总额 − 历史消耗） */
import type { StudioClient } from '../client.js'

export async function balance(client: StudioClient): Promise<void> {
  const r = await client.balance()
  // 单位 ¥ 人民币（后台 2026-08-09 起只返回租户自己的余额，不再下发上游供应商聚合数据）。
  // 优先读 balance_cny：中台已改用这个名字，balance_usd 是双发过渡期的旧名，
  // 两个值永远相等，但等中台停发旧名时这里不用再改一次。
  const cny = r.balance_cny ?? r.balance_usd
  process.stderr.write(`余额: ¥${cny?.toFixed(2) ?? '?'}`)
  if (r.markup_pct) process.stderr.write(`  加价率: ${(r.markup_pct * 100).toFixed(0)}%`)
  if (r.checked_at) process.stderr.write(`  校验时间: ${r.checked_at.slice(0, 19).replace('T', ' ')}`)
  process.stderr.write('\n')
  console.log(JSON.stringify(r))
}
