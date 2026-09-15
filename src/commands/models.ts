/** museav models —— 查可用模型 / 视频档次 */
import type { StudioClient } from '../client.js'

/**
 * stdout 只出 value（脚本用），人看的表格走 stderr —— 与其他命令同一约定。
 *
 * `--video` 走中台的 `?media_type=video`，拿到的是**档次对外名**（Seedance 2.0）。
 * 这里刻意不硬编码任何档次名：上游换档次、换供应商时这个命令的输出自动跟着变，
 * CLI 不用发版。原先 `gen --video` 的 help 里写死了一串上游渠道代号，既泄露供应商
 * 身份，又会在上游下线时变成一堆没人认得的字符串。
 *
 * 3.4.0 移除了 `gen --model` 之后，这里**不能再教用户去传它**——档次由中台按参数
 * 自动挑。这个命令的定位随之从「查完拿去传参」改成「看当前在用什么」。
 */
export async function models(client: StudioClient, opts: { video?: boolean } = {}): Promise<void> {
  const list = await client.models(opts.video ? 'video' : undefined)
  if (!list.length) {
    process.stderr.write(opts.video ? '当前没有可用的视频档次\n' : '当前没有可用的模型\n')
    return
  }
  process.stderr.write(opts.video ? `可用视频档次（${list.length} 个）:\n` : `可用模型（${list.length} 个）:\n`)
  for (const m of list) {
    // 视频档次带时长/分辨率，顺手打出来——用户不用试错就知道这档能出多长、多清晰
    const range = opts.video
      ? [
        m.max_seconds != null
          ? `${m.min_seconds}–${m.max_seconds} 秒`
          : (m.min_seconds != null ? `最短 ${m.min_seconds} 秒` : null),
        m.resolutions?.length ? m.resolutions.join('/') : null,
      ].filter(Boolean).join('  ')
      : ''
    process.stderr.write(`  ${m.label.padEnd(28)} ${range}\n`)
  }
  if (opts.video) {
    // 3.4.0 已移除 gen --model，这行原来还在教人传它 —— 照着做直接报
    // 「unknown option」。这里只说怎么出视频，档次交给中台挑。
    process.stderr.write("\n出视频: museav gen --video --prompt '...'（用哪个档次由中台按参数自动挑）\n")
  }
  // stdout 输出 value 列表（便于脚本解析）：视频这里就是档次名，给脚本做展示/校验用
  console.log(list.map((m) => m.value).join('\n'))
}
