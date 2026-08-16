/** museav whoami —— 查当前登录账户 + 租户归属 */
import type { StudioClient } from '../client.js'
import { loadConfig } from '../config.js'

export async function whoami(client: StudioClient): Promise<void> {
  // apiKey 是系统接入方/服务身份，不是个人账户，/api/me 不适用——直接提示，别等服务端 401
  const cfg = loadConfig()
  if (cfg.apiKey && !cfg.token) {
    throw new Error(
      'whoami 只支持个人 login 身份：museav login\n' +
      '（apiKey 代表接入的业务系统，不是个人账户，可用 museav jobs / balance 查看业务数据）',
    )
  }
  const me = await client.me()
  process.stderr.write(`账户: ${me.nickname || me.email}（${me.email}）\n`)
  process.stderr.write(me.brand ? `业务系统: ${me.brand.name}\n` : '业务系统: 未接入（个人用户）\n')
  process.stderr.write(`出图: 累计 ${me.gen_total} 次，成功 ${me.gen_done} 次\n`)
  console.log(JSON.stringify(me))
}
