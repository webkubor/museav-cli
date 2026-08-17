/** museav whoami —— 查当前身份 + 关联信息。
 *
 * apiKey 模式下也支持（2026-08-17 修复）：服务端 /api/me 对两种 apiKey 都返回真实数据——
 *   - 平台账户 apiKey（STUDIO_API_KEY 指向 accounts.sk-*） → 走个人身份，含 credits / gen 统计
 *   - 租户 apiKey（指向 api_tenants.tenant_key）              → 走业务身份，只下发 tenant 信息
 * 个人 login（museav login）走完整 me，输出不变。
 */
import type { StudioClient } from '../client.js'

/** /api/me 实际返回的形状：可能是账户身份也可能是租户身份（apiKey 模式） */
type MeResponse =
  | {
      identity?: 'account'
      id: string
      email: string
      nickname?: string | null
      bio?: string | null
      role: string
      credits?: number | null
      gen_quota?: number | null
      gen_total?: number
      gen_done?: number
      brand?: { name: string } | null
    }
  | {
      identity: 'tenant'
      tenant: { id: string; name: string; nickname?: string | null; logo?: string | null }
    }

export async function whoami(client: StudioClient): Promise<void> {
  const me = (await client.me()) as MeResponse

  if (me.identity === 'tenant') {
    const t = me.tenant
    process.stderr.write(`身份: 租户 API Key\n`)
    process.stderr.write(`租户: ${t.nickname || t.name}（${t.name}）\n`)
    process.stderr.write(`tenant_id: ${t.id}\n`)
    if (t.logo) process.stderr.write(`logo: ${t.logo}\n`)
  } else {
    process.stderr.write(`账户: ${me.nickname || me.email}（${me.email}）\n`)
    process.stderr.write(me.brand ? `业务系统: ${me.brand.name}\n` : `身份: 平台账户 API Key\n`)
    process.stderr.write(`出图: 累计 ${me.gen_total ?? 0} 次，成功 ${me.gen_done ?? 0} 次\n`)
    if (me.credits != null) process.stderr.write(`credits: ${me.credits}\n`)
  }
  console.log(JSON.stringify(me))
}
