/**
 * 本地超分（放大）—— upscale 的核心实现。
 *
 * 引擎：realesrgan-ncnn-vulkan（xinntao 官方 release，**BSD-3-Clause**）。
 *
 * 2026-09-16 从 upscayl-ncnn 换过来。upscayl-ncnn 是本项目的 fork、CLI 完全一致，
 * 但它是 **AGPL-3.0**。原来的做法（运行时从 upscayl 官方 release 下到用户机器、
 * 独立进程调用、不打包不链接不改动）**本身不构成违规** —— 用户是直接从上游取得的，
 * 我们既没有 convey 也没有 modify。换掉不是因为在违规，是因为：
 *   ① 省掉一个下载 —— 模型本来就从这个 BSD 包里取，二进制也在同一个包里，
 *      原来等于为了一个 15MB 的引擎多下一次；
 *   ② 免掉一个长期要有人记得的论证 —— 哪天有人图省事把二进制打进 npm 包，
 *      AGPL 的分发义务立刻就附上来了，而那种改动看着毫无风险。
 * 换句话说：不是在补窟窿，是把「需要靠纪律维持的安全」换成「结构上就没这回事」。
 *
 * 跨平台：macos / ubuntu / windows 三个 zip 都在同一个 release；macOS 是
 * universal（x86_64 + arm64，Apple Silicon 原生跑）。
 * 解压统一走 `tar -xf`（Win10+/macOS/Linux 都自带 libarchive 版 tar，不依赖 unzip）；
 * 二进制落地后 chmod +x（Windows 不需要）。全程 node:child_process execFile，零 shell。
 *
 * 代价要知道：这个构建停在 2022-04-24，上游不再更新；upscayl 那边仍在活跃维护。
 * 对「4x 放大」这个固定用途够用（2026-09-16 实测 1024→4096 正常），
 * 但若将来要新模型或新特性，得重新评估。
 */
import { mkdir, writeFile, stat, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

// 引擎与模型在**同一个 zip** 里：一次下载两样都有，别再拆成两次。
// 锁定 v0.2.5.0 / 20220424（实测可用）；换版本要重新过一遍实跑。
const ESRGAN_TAG = 'v0.2.5.0'
const ESRGAN_BUILD = '20220424'
const esrganZip = (os: 'macos' | 'ubuntu' | 'windows') =>
  `https://github.com/xinntao/Real-ESRGAN/releases/download/${ESRGAN_TAG}/realesrgan-ncnn-vulkan-${ESRGAN_BUILD}-${os}.zip`

export const UPSCALE_MODELS = {
  'realesrgan-x4plus': { label: '通用照片（默认）' },
  'realesrgan-x4plus-anime': { label: '插画/动漫' },
} as const
export type UpscaleModel = keyof typeof UPSCALE_MODELS

const BIN_DIR = join(homedir(), '.museav-bin', 'realesrgan')
const MODEL_DIR = join(homedir(), '.museav-models')

function platformAsset(): { zip: string; exe: string } {
  if (process.platform === 'win32') return { zip: esrganZip('windows'), exe: 'realesrgan-ncnn-vulkan.exe' }
  if (process.platform === 'darwin') return { zip: esrganZip('macos'), exe: 'realesrgan-ncnn-vulkan' }
  return { zip: esrganZip('ubuntu'), exe: 'realesrgan-ncnn-vulkan' }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function download(url: string, dest: string, label: string): Promise<void> {
  const resp = await fetch(url)
  if (!resp.ok || !resp.body) throw new Error(`${label} 下载失败 HTTP ${resp.status}`)
  const total = Number(resp.headers.get('content-length') || 0)
  const chunks: Buffer[] = []
  let got = 0
  const reader = resp.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    got += value.length
    if (total) process.stderr.write(`  ${label} ${(got / 1048576).toFixed(1)}/${(total / 1048576).toFixed(0)}MB\r`)
  }
  process.stderr.write('\n')
  await writeFile(dest, Buffer.concat(chunks))
}

/** 首次使用时准备好二进制与模型，返回 { exe, modelDir }。之后直接走缓存。
 *  引擎与模型同在一个 zip，所以只下一次；缺任意一样都重下。 */
export async function ensureUpscaleRuntime(): Promise<{ exe: string; modelDir: string }> {
  const { zip, exe } = platformAsset()
  const exePath = join(BIN_DIR, exe)
  const modelDir = join(MODEL_DIR, 'realesrgan')
  const paramPath = join(modelDir, 'realesrgan-x4plus.param')

  if ((await exists(exePath)) && (await exists(paramPath))) return { exe: exePath, modelDir }

  await mkdir(BIN_DIR, { recursive: true })
  await mkdir(modelDir, { recursive: true })
  const zipPath = join(BIN_DIR, 'dl.zip')
  process.stderr.write(`↓ 首次使用，下载超分引擎与模型（~50MB，一次性，缓存到 ${BIN_DIR}）...\n`)
  await download(zip, zipPath, '引擎+模型')

  // Windows 的 exe 依赖同目录的 OpenMP 运行时，漏了直接起不来
  const binMembers = process.platform === 'win32'
    ? [exe, 'vcomp140.dll', 'vcomp140d.dll']
    : [exe]
  const modelMembers = [
    'models/realesrgan-x4plus.param', 'models/realesrgan-x4plus.bin',
    'models/realesrgan-x4plus-anime.param', 'models/realesrgan-x4plus-anime.bin',
  ]
  // 只解需要的成员：包里还带着 demo 视频和示例图，全解等于白占 100MB
  await run('tar', ['-xf', zipPath, '-C', BIN_DIR, ...binMembers], { windowsHide: true })
  await run('tar', ['-xf', zipPath, '-C', MODEL_DIR, ...modelMembers], { windowsHide: true })

  const { rename, rm, unlink } = await import('node:fs/promises')
  for (const m of modelMembers) {
    const f = m.slice('models/'.length)
    await rename(join(MODEL_DIR, 'models', f), join(modelDir, f)).catch(() => {})
  }
  await rm(join(MODEL_DIR, 'models'), { recursive: true, force: true }).catch(() => {})
  await unlink(zipPath).catch(() => {})

  if (process.platform !== 'win32') await chmod(exePath, 0o755)
  if (!(await exists(exePath))) throw new Error(`解压后未找到 ${exe}，请检查 ${BIN_DIR}`)
  if (!(await exists(paramPath))) throw new Error(`模型解压失败，请检查 ${modelDir}`)
  return { exe: exePath, modelDir }
}

/** 超分主流程：返回输出文件的字节数组由引擎直写磁盘，这里只负责调度 */
export async function upscaleLocal(opts: {
  input: string
  output: string
  scale: number
  model: UpscaleModel
}): Promise<void> {
  const { exe, modelDir } = await ensureUpscaleRuntime()
  // 不走 shell 拼接；路径原样传参，空格/中文路径都安全
  await run(exe, ['-i', opts.input, '-o', opts.output, '-s', String(opts.scale), '-n', opts.model, '-m', modelDir], { windowsHide: true })
}
