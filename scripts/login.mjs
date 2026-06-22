#!/usr/bin/env node
/**
 * 取登录账户并生成 dev 一键登录片段。
 * 账户真源：cs secrets `secret://modelgo/accounts`（JSON 数组，不落仓库明文）。
 *
 * 用法：
 *   node scripts/login.mjs            # 列出全部账户 + __mg_login 片段
 *   node scripts/login.mjs test       # 只看 test 环境
 *   node scripts/login.mjs prod       # 只看 prod 环境
 *
 * 拿到片段后：pnpm dev → http://localhost:5175 → 浏览器 console 粘贴执行。
 * __mg_login 仅 DEV 挂载（见 src/lib/dev-auth.ts），生产构建被 tree-shake。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const CS = [`${process.env.HOME}/Documents/CortexOS/bin/cs`, 'cs'].find(
  (p) => p === 'cs' || existsSync(p),
)
const envFilter = process.argv[2]?.toLowerCase()

let accounts
try {
  const raw = execFileSync(CS, ['secrets', 'get', 'secret://modelgo/accounts'], {
    encoding: 'utf8',
  })
  accounts = JSON.parse(raw)
} catch (err) {
  console.error('✗ 取账户失败：', err.message)
  console.error('  确认 cs 可用且已解锁密钥库：cs secrets get secret://modelgo/accounts')
  process.exit(1)
}

const list = envFilter ? accounts.filter((a) => a.env === envFilter) : accounts
if (!list.length) {
  console.error(`✗ 没有 env=${envFilter} 的账户。可用：${[...new Set(accounts.map((a) => a.env))].join(', ')}`)
  process.exit(1)
}

for (const a of list) {
  const tag = `[${a.env}]${a.role ? ` ${a.role}` : ''}`
  console.log(`\n${tag} ${a.email}${a.note ? `  — ${a.note}` : ''}`)
  console.log(`  await window.__mg_login(${JSON.stringify(a.email)}, ${JSON.stringify(a.password)})`)
}
console.log()
