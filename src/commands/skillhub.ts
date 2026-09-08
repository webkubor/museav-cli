/**
 * museav skillhub —— 把本地 Skill 发布到小红书 SkillHub。
 *
 * 这里只做**薄封装**：打包、设备码授权、上传、提交全部由官方 CLI
 * `redskillhub-upload`（本包的 dependency）完成，我们不复制它的任何协议。
 * 平台改版时升这条 dependency 就行，不用动这个文件。
 *
 * 官方 CLI 的输出契约（cli/output.mjs）：stdout 逐行 `RESULT_JSON:{...}` /
 * `PROMPT:{...}` / `UPLOAD_PROGRESS:<n>`。我们只挑最后一行 RESULT_JSON 出摘要。
 *
 * 两个不能省的坑：
 * 1. 官方 `--yes` 是**死 flag**——只在 parseArgs 里被赋值，全流程没有消费点。
 *    要免交互提交，只能往 stdin 推 `submit\n`（官方 SKILL.md 也是这个口径）。
 * 2. 缺 `--source` / `--tag` 时官方会转成交互提问读 stdin，和我们推的 `submit`
 *    抢同一条管道。所以这两个参数在本层就补齐/校验，绝不让它进交互分支。
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

/** dry-run 只是本地打包 + 校验，两分钟够；真提交要等扫码授权，给 15 分钟 */
const DRY_RUN_TIMEOUT_MS = 120_000
const PUBLISH_TIMEOUT_MS = 900_000

export interface SkillhubPublishOptions {
  source?: string
  tag?: string
  repostSource?: string
  identifier?: string
  yes?: boolean
}

/**
 * 定位官方 CLI 入口。走 createRequire 解析包内文件，而不是指望 PATH 上有
 * `redskillhub-upload` 命令——它是我们的 dependency，不要求用户全局装过。
 * 后面用 process.execPath 直接跑这个 .mjs，也就绕开了 .bin shim 与 Windows
 * 的 .cmd 差异（AGENTS.md 的跨平台约定）。
 */
function cliEntry(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('redskillhub-upload/cli/index.mjs')
  } catch {
    throw new Error(
      '找不到官方上传 CLI（redskillhub-upload）。重装一次 museav 即可带上：npm i -g museav-cli',
    )
  }
}

/**
 * 拼官方 publish 参数。抽成纯函数是为了能断言——参数拼错的代价是把错的
 * source/tag 提交到平台，而 Skill ID 提交后跨版本不可改。
 */
export function buildPublishArgs(skillPath: string, opts: SkillhubPublishOptions): string[] {
  const tag = (opts.tag || '').trim()
  if (!tag) {
    throw new Error(
      '缺 --tag：平台要求至少一个内容标签，且没有合理默认值。\n' +
      '先看可选标签： museav skillhub tags\n' +
      '再带上，多个用逗号分隔： museav skillhub publish <目录> --tag 效率工具,内容创作',
    )
  }

  // 默认原创；转载必须说清来源，否则平台侧校验会拒
  const source = (opts.source || 'original').trim()
  if (source !== 'original' && source !== 'repost') {
    throw new Error(`--source 只能是 original（原创）或 repost（转载），收到「${source}」`)
  }
  const repostSource = (opts.repostSource || '').trim()
  if (source === 'repost' && !repostSource) {
    throw new Error('--source repost 必须同时给 --repost-source <来源平台名>（15 字以内）')
  }
  if (source === 'original' && repostSource) {
    throw new Error('--repost-source 只在 --source repost 时有意义，原创稿不要带')
  }

  // --agent 是官方验证过的调用形态（SKILL.md Step 2/3），让它走结构化输出而不是彩色 TUI
  const args = [cliEntry(), 'publish', skillPath, '--agent', '--source', source, '--tag', tag]
  if (repostSource) args.push('--repost-source', repostSource)
  if (opts.identifier) args.push('--identifier', String(opts.identifier).trim())
  if (!opts.yes) args.push('--dry-run')
  return args
}

/** 取最后一行 RESULT_JSON 的载荷；官方在 dry-run/提交/取消/报错时都会写这一行 */
function lastResultJson(stdout: string): any {
  const line = stdout.split('\n').filter((l) => l.startsWith('RESULT_JSON:')).at(-1)
  if (!line) return null
  try {
    return JSON.parse(line.slice('RESULT_JSON:'.length))
  } catch {
    return null
  }
}

/**
 * 跑官方 CLI。capture=true 时收走两条流供解析（成功的 RESULT_JSON 在 stdout，
 * 失败的在 stderr——见官方 index.mjs 顶层 catch），否则原样透传给终端（二维码/进度要人看见）。
 * stderr 即使被 capture 也照样转发出去，不然人看不到失败原文。
 */
function runCli(
  args: string[],
  { capture, feedStdin, timeoutMs }: { capture: boolean; feedStdin?: string; timeoutMs: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: [feedStdin ? 'pipe' : 'ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (b: Buffer) => {
      stdout += b.toString()
    })
    child.stderr?.on('data', (b: Buffer) => {
      stderr += b.toString()
      process.stderr.write(b)
    })
    if (feedStdin) {
      // confirm 阶段之前官方不读 stdin，先写进管道等它来取即可
      child.stdin!.on('error', () => { /* 进程先退了，忽略断管 */ })
      child.stdin!.end(feedStdin)
    }
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`官方 CLI 超时被终止（${Math.round(timeoutMs / 1000)}s，signal=${signal}）`))
        return
      }
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/** museav skillhub tags —— 列平台实时内容标签。stdout 出中文名，一行一个，好接管道 */
export async function skillhubTags(): Promise<void> {
  const { code, stdout, stderr } = await runCli([cliEntry(), 'tags'], { capture: true, timeoutMs: 30_000 })
  const result = lastResultJson(stdout + stderr)
  if (code !== 0 || !result || result.status !== 'ok') {
    throw new Error(`拉标签失败：${result?.message || `官方 CLI 退出码 ${code}`}`)
  }
  const tags: Array<{ name?: string; tagId?: string | number }> = result.tags || []
  if (!tags.length) {
    process.stderr.write('平台没有返回可选标签\n')
    return
  }
  process.stderr.write(`SkillHub 内容标签（${tags.length} 个）:\n`)
  for (const t of tags) process.stderr.write(`  ${String(t.name || '').padEnd(16)} ${t.tagId ?? ''}\n`)
  process.stderr.write('\n发布： museav skillhub publish <目录> --tag <中文名[,中文名...]>\n')
  console.log(tags.map((t) => t.name).filter(Boolean).join('\n'))
}

/** museav skillhub whoami / logout / login [--cancel] —— 原样透传给官方 CLI */
export async function skillhubPassthrough(
  command: 'whoami' | 'logout' | 'login',
  opts: { cancel?: boolean } = {},
): Promise<void> {
  const args = [cliEntry(), command]
  if (command === 'login' && opts.cancel) args.push('--cancel')
  // login 要出二维码给人扫，不能 capture
  const capture = command !== 'login'
  const { code, stdout } = await runCli(args, {
    capture,
    timeoutMs: command === 'login' ? PUBLISH_TIMEOUT_MS : 30_000,
  })
  if (capture && stdout) process.stdout.write(stdout)
  if (code !== 0) throw new Error(`官方 CLI ${command} 退出码 ${code}`)
}

/**
 * museav skillhub publish —— 默认只做 dry-run（不登录、不上传、不提交），
 * 把待提交载荷摊给人看；确认无误再加 --yes 真提交。
 *
 * 提交是外发且不可逆（Skill ID 是平台主键，跨版本不可改名），所以护栏不省：
 * 没有 --yes 一律不出网提交。
 */
export async function skillhubPublish(skillPath: string, opts: SkillhubPublishOptions): Promise<void> {
  const args = buildPublishArgs(skillPath, opts)

  if (!opts.yes) {
    process.stderr.write(`预演发布 ${skillPath}（dry-run，不上传不提交）...\n`)
    const { code, stdout, stderr } = await runCli(args, { capture: true, timeoutMs: DRY_RUN_TIMEOUT_MS })
    const result = lastResultJson(stdout + stderr)
    if (code !== 0 || !result || result.status === 'error') {
      const why = result?.message || `官方 CLI 退出码 ${code}`
      // 官方只说「移除后重试」，不说什么能留。白名单是它的规则（pack.mjs），不在这里复制一份，
      // 只点一句最常踩的：.mjs / .ts / .yaml 这些都不在名单里。
      const hint = why.includes('不支持上传的文件')
        ? '\n提示：平台只收文本类扩展名（.md / .js / .py / .json / .sh 等），.mjs、.ts、.yaml 都不在名单里——改扩展名或把该文件移出 skill 目录'
        : ''
      throw new Error(`预演失败：${why}${hint}`)
    }
    const p = result.payload || {}
    process.stderr.write('待提交内容：\n')
    process.stderr.write(`  名称       ${p.name ?? ''}\n`)
    process.stderr.write(`  Skill ID   ${p.skill_identifier ?? ''}   ← 平台主键，提交后跨版本不可改\n`)
    process.stderr.write(`  版本       ${p.version ?? ''}\n`)
    process.stderr.write(`  简介       ${p.description ?? ''}\n`)
    process.stderr.write(`  来源       ${p.original ? '原创' : `转载 · ${p.repost_source || ''}`}\n`)
    process.stderr.write(`  标签       ${opts.tag}\n`)
    process.stderr.write(`\n核对无误后真提交（会要求小红书 App 扫码授权）：\n`)
    process.stderr.write(`  museav skillhub publish ${skillPath} --tag ${opts.tag} --yes\n`)
    console.log(JSON.stringify(p))
    return
  }

  process.stderr.write(`发布 ${skillPath} 到 SkillHub...\n`)
  process.stderr.write('未登录会先出二维码，用小红书 App 扫一下；授权后同一进程继续上传\n')
  // 官方 --yes 是死 flag，免交互提交只能推 stdin；参数已在 buildPublishArgs 里补齐，
  // 不会有别的提问来抢这个 submit
  const { code } = await runCli(args, { capture: false, feedStdin: 'submit\n', timeoutMs: PUBLISH_TIMEOUT_MS })
  if (code !== 0) throw new Error(`发布失败（官方 CLI 退出码 ${code}），上面的 RESULT_JSON 有具体原因`)
  process.stderr.write('✅ 已提交，等平台审核\n')
}
