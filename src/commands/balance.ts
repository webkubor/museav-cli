/** studio-image balance —— 查上游余额 */
import type { StudioClient } from '../client.js'

export async function balance(client: StudioClient): Promise<void> {
  const r = await client.balance()
  process.stderr.write(`总余额: $${r.balance_usd?.toFixed(2) ?? '?'}  可用上游: ${r.providers_ok}\n`)
  if (r.providers?.length) {
    process.stderr.write(`\n各供应商:\n`)
    for (const p of r.providers) {
      const mark = p.ok ? '✅' : '❌'
      process.stderr.write(`  ${mark} ${(p.label || p.name).padEnd(16)} $${p.balance_usd?.toFixed(2) ?? '?'}\n`)
    }
  }
  console.log(JSON.stringify(r))
}
