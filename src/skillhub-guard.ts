/**
 * 发布护栏：平台的公共资产不得外发到小红书 SkillHub。
 *
 * ## 为什么需要这道护栏
 *
 * `museav skillhub publish` 是**出站**动作——发出去的东西落在第三方平台（小红书）
 * 上，撤不回来。而 MUSE AV 中台里有一批**平台公共模板**（`templates --platform`）
 * 和**公共技能库**（`skills` 里 `private=false && agency=false` 的那些）。
 * 那些是平台资产：用户只是使用权，不是所有权。把它们包装成 Skill 发到小红书，
 * 等于把别人的东西挂在别人的平台上。
 *
 * ## 卡什么、不卡什么
 *
 * 这条线很容易划错，划错了要么挡死合法用例，要么形同虚设：
 *
 * - **搬运（拦）**：Skill 正文里出现了平台公共模板的 `prompt_template` 原文。
 *   这是把模板内容**复制**出去重新分发 —— 明确禁止。
 * - **引用（放行）**：Skill 里写了平台模板的 `slug` / `id`，
 *   比如教 agent `museav gen --template ecommerce-white-bg`。
 *   这是一个**指针**，不是资产，跟文档里写一句「本命令需要先配置 API Key」同性质。
 *   把引用也拦掉会挡死 museav 自己的集成类 Skill，那是误伤。
 *
 * 所以判据落在**内容指纹**上，不是简单的关键词匹配。
 *
 * ## 拿不到清单时怎么办
 *
 * 清单要调中台接口拿。没登录 / 网络不通就拉不到。这时**不能**默认放行（那等于
 * 护栏形同虚设），也**不能**默认拦死（那会挡死没配 museav 的纯本地 Skill 发布者）。
 * 折中：放行，但在 stderr 明确说清这次没做校验 —— 知情比假装有护栏重要。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import type { SkillOption, TemplateOption } from './client.js'

/**
 * museav 自己在本地托管的目录。这些是平台下发的模型/引擎，不是用户的 Skill，
 * 拿它们去发布毫无意义（体积也超限），直接按路径挡掉。
 */
const MANAGED_ASSET_DIRS = ['.museav-models', '.museav-bin']

/** 二进制/媒体扩展名：扫不出可匹配文本，跳过（顺带避免读大文件） */
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svgz',
  '.mp4', '.mov', '.avi', '.webm', '.mp3', '.wav',
  '.pdf', '.zip', '.gz', '.tar', '.onnx', '.bin', '.pt', '.safetensors',
])

/** 单文件扫描上限：超过多半不是 Skill 说明书，不值得逐字读 */
const MAX_FILE_BYTES = 256 * 1024
/** 目录内扫描文件数上限：防止误指一个巨型目录把 CLI 拖死 */
const MAX_FILES = 500

/**
 * 模板正文指纹取多长。短了会误伤（很多模板开头都是「生成一张…」），
 * 长了会漏（用户改过一个字就匹配不上）。60 个归一化后的字符是个能两头兼顾的点。
 */
const FINGERPRINT_LEN = 60

/**
 * 归一化：**删掉所有空白**，不是折叠成单个空格。
 *
 * 一开始写的是「连续空白折叠成一个空格」，看着一样，实际漏了一类绕过：
 * 搬运者只要在句子中间多敲一个空格（`背景，  商品`），折叠后仍是 `背景， 商品`，
 * 而原文是 `背景，商品`，照样匹配不上。折行、改缩进能挡住，句中加空格挡不住——
 * 而后者恰恰是最省事的改写。指纹比对本来就不该被空白影响，索性全删。
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, '')
}

/**
 * 目标路径是否落在平台托管目录里。离线可判，不依赖中台，所以永远生效。
 * 返回命中的目录名，没命中返回 null。
 */
export function findManagedAssetDir(skillPath: string): string | null {
  const abs = resolve(skillPath)
  for (const dir of MANAGED_ASSET_DIRS) {
    const managed = join(homedir(), dir)
    if (abs === managed || abs.startsWith(managed + sep)) return dir
  }
  return null
}

/**
 * 递归收集待扫描的文本文件。.zip 源包不解（解包是官方 CLI 的事，AGENTS.md 有约定），
 * 只把 zip 本身记下来让上层决定怎么处理。
 */
export function collectTextFiles(
  root: string,
  { maxFiles = MAX_FILES }: { maxFiles?: number } = {},
): { files: string[]; total: number; skippedBinary: boolean } {
  const files: string[] = []
  let total = 0
  let skippedBinary = false

  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules' || name === '__MACOSX') continue
      const full = join(dir, name)
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!st.isFile()) continue
      total += 1
      const dot = name.lastIndexOf('.')
      if (dot >= 0 && SKIP_EXT.has(name.slice(dot).toLowerCase())) {
        skippedBinary = true
        continue
      }
      if (st.size > MAX_FILE_BYTES) continue
      if (files.length < maxFiles) files.push(full)
    }
  }

  walk(resolve(root))
  return { files, total, skippedBinary }
}

/**
 * 从平台公共模板里抽正文指纹。
 * 只收平台共享的（source=platform / tenant_id 为空），租户自己建的不算平台资产。
 * 正文太短的模板（占位文案）指纹没有区分度，直接跳过，否则误伤一片。
 */
export function collectPlatformFingerprints(templates: TemplateOption[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of templates) {
    const isPlatform = t.source === 'platform' || !t.tenant_id
    if (!isPlatform) continue
    for (const cfg of t.generation_configs || []) {
      const body = normalize(cfg.prompt_template || '')
      if (body.length < FINGERPRINT_LEN) continue
      out.set(t.id, body.slice(0, FINGERPRINT_LEN))
    }
  }
  return out
}

/**
 * 扫文本找命中的平台模板正文。命中即「这个 Skill 抄了平台模板」。
 * 返回命中项 [{ id, file }]，去重后按模板 id 排。
 */
export function findFingerprintHits(
  files: string[],
  fingerprints: Map<string, string>,
): Array<{ id: string; file: string }> {
  const hits: Array<{ id: string; file: string }> = []
  const seen = new Set<string>()
  for (const file of files) {
    let text: string
    try {
      text = normalize(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const [id, fp] of fingerprints) {
      if (seen.has(id)) continue
      if (text.includes(fp)) {
        seen.add(id)
        hits.push({ id, file })
      }
    }
  }
  return hits.sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * 平台公共库（skills 里既非私有也非租户专属的那些）的 slug 清单。
 * 只用来在报错里告诉用户「你碰到的是哪一类平台资产」，不做拦截判据——
 * 理由见文件头：引用 slug 是合法集成。
 */
export function collectPublicLibrarySlugs(skills: SkillOption[]): string[] {
  return skills.filter((s) => !s.private && !s.agency).map((s) => s.slug).filter(Boolean)
}

export interface GuardInput {
  /** 待发布的本地路径（目录或 .zip） */
  skillPath: string
  /** 平台公共模板清单；拉不到就传 null，表示本次没做内容校验 */
  templates: TemplateOption[] | null
}

export interface GuardResult {
  /** 是否放行 */
  ok: boolean
  /** 命中的平台模板（搬运） */
  copiedTemplates: Array<{ id: string; file: string }>
  /** 命中的托管目录；null 表示路径没问题 */
  managedDir: string | null
  /** 本次是否真的做了内容校验 */
  contentChecked: boolean
  /** 扫了多少文件，用于把话说清楚 */
  scannedFiles: number
}

/**
 * 护栏主入口。**不抛异常** —— 返回结构化结果，让调用方决定怎么呈现
 * （发布是交互式的，把判断依据摊给用户看比直接 throw 一句「禁止」更好）。
 */
export function inspectPublishTarget({ skillPath, templates }: GuardInput): GuardResult {
  const managedDir = findManagedAssetDir(skillPath)
  if (managedDir) {
    return { ok: false, copiedTemplates: [], managedDir, contentChecked: false, scannedFiles: 0 }
  }

  // .zip 源包：内容校验交给官方 CLI 解包后做，这里不做（AGENTS.md：不重复官方 CLI 的活）
  if (/\.zip$/i.test(skillPath)) {
    return { ok: true, copiedTemplates: [], managedDir: null, contentChecked: false, scannedFiles: 0 }
  }

  if (!templates) {
    return { ok: true, copiedTemplates: [], managedDir: null, contentChecked: false, scannedFiles: 0 }
  }

  const fingerprints = collectPlatformFingerprints(templates)
  if (!fingerprints.size) {
    return { ok: true, copiedTemplates: [], managedDir: null, contentChecked: false, scannedFiles: 0 }
  }

  const { files, total } = collectTextFiles(skillPath)
  const copiedTemplates = findFingerprintHits(files, fingerprints)
  return {
    ok: copiedTemplates.length === 0,
    copiedTemplates,
    managedDir: null,
    contentChecked: true,
    scannedFiles: total,
  }
}

/** 把护栏结论写成人话。走到这里基本都是「拦下来了」，理由要说透。 */
export function formatGuardRejection(result: GuardResult, skillPath: string): string {
  if (result.managedDir) {
    return (
      `拒绝发布：${skillPath} 落在平台托管目录 ~/${result.managedDir} 里。\n` +
      `这里是 museav 下发的模型/引擎，不是可发布的 Skill。要发的是你自己写的 Skill 目录。`
    )
  }
  if (result.copiedTemplates.length) {
    const list = result.copiedTemplates.map((h) => `  - 平台模板 ${h.id}（命中于 ${h.file}）`).join('\n')
    return (
      `拒绝发布：这个 Skill 里包含 MUSE AV 平台公共模板的正文。\n` +
      `${list}\n\n` +
      `平台公共模板是平台资产，你可以调用，但不能复制后挂到小红书上再分发。\n` +
      `正确做法：Skill 里只写调用方式（例如 museav gen --template <slug>），不要把模板正文抄进来。\n` +
      `如果你要发的是自己写的 Skill，去掉这些正文后重试。`
    )
  }
  return ''
}
