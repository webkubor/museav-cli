/**
 * CLI 身份欢迎（2026-08-15）——login（个人 token）和 config（租户 apiKey）共用。
 *
 * 原则：不管哪种凭证，配置完成后都识别「我是谁」并打招呼：
 *   - 个人 token → 账户身份（superadmin 山鬼映画 / 租户成员 / 平台用户）
 *   - 租户 apiKey → 租户身份（XX 租户）
 * 然后给使用引导 + 联系我 + 绑定说明。
 */
import type { MeInfo } from '../client.js'
import { StudioClient } from '../client.js'

export interface WelcomeCred {
  token?: string
  apiKey?: string
}

/** 终端显示宽度：ASCII=1，中文等宽字符=2（终端等宽字体下中文占 2 格） */
function displayWidth(s: string): number {
  return [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)
}

function box(lines: string[]): string {
  const width = Math.max(...lines.map(displayWidth)) + 4
  const border = '┌' + '─'.repeat(width) + '┐'
  const bottom = '└' + '─'.repeat(width) + '┘'
  return [
    border,
    ...lines.map((l) => `│ ${l}${' '.repeat(width - displayWidth(l))} │`),
    bottom,
  ].join('\n')
}

/** 打印身份欢迎。识别失败时给兜底问候，不影响 CLI 继续使用。 */
export async function printWelcome(baseUrl: string, cred: WelcomeCred): Promise<void> {
  let me: MeInfo | null = null
  try {
    me = await new StudioClient({ baseUrl, ...cred }).me()
  } catch {
    me = null
  }

  if (me?.identity === 'tenant') {
    // ── 系统接入方（apiKey 模式）──
    // 「租户」是内部技术称谓，对客户不暴露：客户视角是「我们的系统接入了
    // MUSE AV AI 创作平台」，我们是服务提供方，不是把对方当租客。
    const t = me.tenant
    const tname = t?.nickname || t?.name || '贵方系统'
    process.stderr.write(`👋 欢迎，${tname}！MUSE AV AI 创作平台已为你的系统接入创作能力\n`)
    process.stderr.write(`   接入方：${tname}（系统级 API Key，为你的业务后台提供图片/视频创作）\n`)
  } else if (me) {
    // ── 个人身份 ──
    const name = me.nickname || me.email
    let identity = '平台用户'
    let greeting = '欢迎使用 MUSE AV 创作中台'
    if (me.role === 'superadmin') {
      identity = '平台超级管理员'
      greeting = '欢迎回来，山鬼映画！平台归你管，出了事找你本人 😄'
    } else if (me.role === 'admin') {
      identity = '平台管理员'
      greeting = `欢迎回来，${name}！`
    } else if (me.brand) {
      // 接入方业务系统的成员（如好易美员工账户）：
      // 身份表达 = 我是「XX」的人，MUSE AV 为「XX」提供创作能力。
      // 不用「租户/租户成员」这类内部词，客户不该有被出租的感觉。
      const biz = me.brand.name
      identity = `${biz}成员`
      greeting = `欢迎，${name}！MUSE AV 为「${biz}」提供 AI 创作能力，你的创作工作台已就绪`
    } else {
      greeting = `欢迎，${name}！`
    }
    const quota = me.generation_remaining != null ? `${me.generation_remaining} 次` : '不限'
    process.stderr.write(`👋 ${greeting}\n`)
    process.stderr.write(`   账户：${me.email}（${identity}）\n`)
    if (me.gen_done != null) process.stderr.write(`   已出图 ${me.gen_done} 张 · 剩余额度 ${quota}\n`)
    // 已绑定飞书：让客户知道缪斯 agent 在飞书里能认出他（未绑定不提示，绑定说明区有引导）
    if (me.feishu_open_id) process.stderr.write('   飞书：已绑定 ✓（缪斯 agent 在飞书群里能认出你）\n')
  } else {
    process.stderr.write('👋 欢迎使用 MUSE AV 创作中台\n')
  }

  process.stderr.write('\n' + box([
    '📖 怎么用（常用命令）',
    '  studio-cli gen --prompt "英文提示词"    自由出图',
    '  studio-cli gen --skill <技能> --input "描述"   技能出图',
    '  studio-cli gen --template <id> --fields \'{..}\'  模板出图',
    '  studio-cli skills / templates / reverse    查技能/模板/逆向',
    '  studio-cli jobs / whoami              记录 / 身份',
    '  studio-cli bind-feishu                绑定飞书',
  ]) + '\n')

  process.stderr.write('\n🔗 找我 / 支持我：\n')
  process.stderr.write('   · GitHub 给项目点个 ⭐ → https://github.com/webkubor/studio-cli\n')
  process.stderr.write('   · 小红书「山鬼映画」（东方电影美学）→ https://www.xiaohongshu.com/user/profile/5c3c1581000000000501835d\n')

  process.stderr.write('\n🎁 我的其他作品（GitHub 上给它们点个 ⭐ 就是最大的支持）：\n')
  process.stderr.write('   · typora-Bloom-theme（Typora 写作主题，★89）→ github.com/webkubor/typora-Bloom-theme\n')
  process.stderr.write('   · voice-editor（本地中文 TTS 工作台）→ github.com/webkubor/voice-editor\n')
  process.stderr.write('   · kyvault（本地加密密钥管理 CLI）→ github.com/webkubor/kyvault\n')
  process.stderr.write('   · wechat-chat-gen（高仿真微信聊天截图生成器）→ github.com/webkubor/wechat-chat-gen\n')
  process.stderr.write('   · knowledge-pdf-kit（Markdown → PDF/长图）→ github.com/webkubor/knowledge-pdf-kit\n')

  process.stderr.write('\nℹ️ 绑定说明：\n')
  process.stderr.write('   · 出图 / 技能 / 模板 / 逆向等全部创作功能【不需要】绑定飞书\n')
  process.stderr.write('   · 绑定飞书（bind-feishu）只影响：让 agent 在飞书里认出你的身份\n')

  process.stderr.write('\n现在就可以开始：studio-cli gen --prompt "一只猫"\n')
}
