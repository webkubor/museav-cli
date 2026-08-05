/** studio-cli skills —— 查可用技能（私有 + 所属租户专属模板 + 公共库） */
import type { StudioClient } from '../client.js'

export async function skills(client: StudioClient, opts: { genre?: string } = {}): Promise<void> {
  let list = await client.skills()
  if (opts.genre) {
    const kw = opts.genre.toLowerCase()
    list = list.filter((s) => (s.genre || '').toLowerCase().includes(kw))
  }
  if (!list.length) {
    process.stderr.write(opts.genre ? `没有匹配「${opts.genre}」的技能\n` : '没有可用技能\n')
    return
  }

  // 归属标记：自己建的 / 所属租户的专属模板 / 公共库——同名时服务端按这个顺序取
  const tag = (s: (typeof list)[number]) => (s.private ? '[私有]' : s.agency ? '[专属]' : '')

  process.stderr.write(`可用技能（${list.length} 个）:\n`)
  for (const s of list) {
    const flag = s.ref_required ? '需垫图' : ''
    process.stderr.write(
      `  ${s.slug.padEnd(30)} ${(s.zh_name || '').padEnd(16)} ${(s.genre || '').padEnd(10)} ${(s.ratio || '').padEnd(6)} ${flag.padEnd(6)} ${tag(s)}\n`,
    )
  }
  process.stderr.write(`\n出图: studio-cli gen --skill <技能名> --input "一句业务描述"\n`)
  process.stderr.write(`标「需垫图」的必须加 --ref ./图.jpg，否则服务端会拒绝\n`)
  // stdout 只出 slug，便于脚本与 agent 解析
  console.log(list.map((s) => s.slug).join('\n'))
}
