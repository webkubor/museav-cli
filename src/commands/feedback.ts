/**
 * museav feedback —— 通过命令行提 bug / 需求，或查我的反馈记录。
 *
 * 为什么需要它：之前 CLI 没有 feedback，用户只能在网页后台提。命令行跑出问题（出图
 * 失败、CLI 报错）时，最顺手的就是当下在终端补一条反馈，而不是切到浏览器。
 *
 * 身份：跟 CLI 其它命令一致，走 loadConfig 的凭证——
 *   - 个人 login token → /api/feedback 按本人落库
 *   - 账户 API Key（sk-studio-*，指向 accounts.api_key_hash）→ /api/feedback 自解析身份（2026-08 补）
 *   - 租户 API Key 会被服务端拒（反馈是个人行为，不该落到租户组织头上）→ 报错提示用个人身份
 *
 * 用法：
 *   museav feedback "出图连续失败三次"
 *   museav feedback --type 需求 "想要批量出图后自动拼长图"
 *   museav feedback --type bug                     # 不带内容 → 交互式输入
 *   museav feedback --list                         # 看我的反馈记录
 */
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { StudioClient } from '../client.js'

export async function feedback(
  getClient: () => StudioClient,
  content: string,
  opts: { type?: string; list?: boolean } = {},
): Promise<void> {
  if (opts.list) {
    await listFeedback(getClient)
    return
  }

  const type: 'bug' | '需求' = opts.type === '需求' ? '需求' : 'bug'
  let text = content?.trim() || ''

  if (!text) {
    // 交互式：没有在命令行给内容，就逐项问。这是给"想提但没想好格式"的人用的，
    // 也给脚本调用了一个确定的形式（--type + 位置参数）。
    const rl = createInterface({ input, output })
    try {
      const pick = await rl.question(`反馈类型？（bug / 需求，默认 ${type === '需求' ? '需求' : 'bug'}）: `)
      const picked = pick.trim()
      const finalType = picked === '需求' ? '需求' : picked === 'bug' ? 'bug' : type
      const body = await rl.question(`描述（你遇到的 bug 或想要的功能）: `)
      text = body.trim()
      if (text) {
        process.stderr.write(`\n提交中...\n`)
        await getClient().submitFeedback({ type: finalType, content: text })
        process.stderr.write(`✅ 已提交${finalType === '需求' ? '需求' : 'bug'}反馈。可以在网页「意见反馈」页看到进度。\n`)
      } else {
        process.stderr.write(`未输入内容，已取消。\n`)
      }
      return
    } finally {
      rl.close()
    }
  }

  process.stderr.write(`提交${type === '需求' ? '需求' : 'bug'}反馈...\n`)
  await getClient().submitFeedback({ type, content: text })
  process.stderr.write(`✅ 已提交${type === '需求' ? '需求' : 'bug'}反馈。可以在网页「意见反馈」页看到进度。\n`)
}

async function listFeedback(getClient: () => StudioClient): Promise<void> {
  const rows = await getClient().listFeedback()
  if (!rows.length) {
    process.stderr.write(`还没有反馈记录。\n`)
    return
  }
  process.stderr.write(`我的反馈（${rows.length} 条）:\n`)
  for (const r of rows) {
    const status = r.status === 'done' ? '已完成' : r.status === 'resolved' ? '已解决' : r.status === 'pending' ? '处理中' : (r.status || '处理中')
    const reply = r.reply ? `\n     回复: ${r.reply}` : ''
    process.stderr.write(`\n[${r.type}] ${status} ${r.created_at}\n  ${r.content}${reply}\n`)
  }
}
