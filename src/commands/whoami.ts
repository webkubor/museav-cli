/** studio-cli whoami —— 查当前登录账户 + 租户归属 */
import type { StudioClient } from '../client.js'

export async function whoami(client: StudioClient): Promise<void> {
  const me = await client.me()
  process.stderr.write(`账户: ${me.nickname || me.email}（${me.email}）\n`)
  process.stderr.write(me.brand ? `归属: ${me.brand.name}\n` : '归属: 平台用户（不属于任何租户）\n')
  process.stderr.write(`出图: 累计 ${me.gen_total} 次，成功 ${me.gen_done} 次\n`)
  console.log(JSON.stringify(me))
}
