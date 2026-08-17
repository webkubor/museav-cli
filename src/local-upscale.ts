/**
 * 本地超分（放大）—— upscale 的核心实现。
 * 引擎：upscayl-ncnn（Real-ESRGAN 的 ncnn/Vulkan 后端，AGPL-3.0 —— 它是独立进程
 * 二进制而非链接进 npm 包，CLI 与之分发解耦，不构成合并作品；这与把 AGPL 代码
 * 编进依赖是两回事）。
 * 跨平台：macOS（universal）/ Windows / Linux 二进制都在 upscayl 官方 release；
 * 解压统一走 `tar -xf`（Win10+/macOS/Linux 都自带 libarchive 版 tar，不依赖 unzip）；
 * 二进制落地后 chmod +x（Windows 不需要）。全程 node:child_process execFile，零 shell。
 */
import { mkdir, writeFile, stat, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

// 锁定已实测的版本（20251207-174704，macOS universal 实测可用），升级要重新过测试
const UPSCAYL_TAG = '20251207-174704'
const UPSCAYL_BASE = `https://github.com/upscayl/upscayl-ncnn/releases/download/${UPSCAYL_TAG}/upscayl-bin-${UPSCAYL_TAG}`
// 模型从 Real-ESRGAN 官方 release 的 zip 里取（只取需要的两个，别拖全量）
const MODEL_ZIP = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip'

export const UPSCALE_MODELS = {
  'realesrgan-x4plus': { label: '通用照片（默认）' },
  'realesrgan-x4plus-anime': { label: '插画/动漫' },
} as const
export type UpscaleModel = keyof typeof UPSCALE_MODELS

const BIN_DIR = join(homedir(), '.museav-bin', 'upscayl')
const MODEL_DIR = join(homedir(), '.museav-models')

function platformAsset(): { zip: string; exe: string } {
  if (process.platform === 'win32') return { zip: `${UPSCAYL_BASE}-windows.zip`, exe: 'upscayl-bin.exe' }
  if (process.platform === 'darwin') return { zip: `${UPSCAYL_BASE}-macos.zip`, exe: 'upscayl-bin' }
  return { zip: `${UPSCAYL_BASE}-linux.zip`, exe: 'upscayl-bin' }
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

/** 首次使用时准备好二进制与模型，返回 { exe, modelDir }。之后直接走缓存 */
export async function ensureUpscaleRuntime(): Promise<{ exe: string; modelDir: string }> {
  const { zip, exe } = platformAsset()
  const exePath = join(BIN_DIR, exe)
  const modelDir = join(MODEL_DIR, 'realesrgan')
  const paramPath = join(modelDir, 'realesrgan-x4plus.param')

  if (!(await exists(exePath))) {
    await mkdir(BIN_DIR, { recursive: true })
    const zipPath = join(BIN_DIR, `dl-${process.platform}.zip`)
    process.stderr.write(`↓ 首次使用，下载超分引擎（~15MB，一次性，缓存到 ${BIN_DIR}）...\n`)
    await download(zip, zipPath, '引擎')
    // tar -xf 解压：Win10+/macOS/Linux 自带，比依赖 unzip 稳
    await run('tar', ['-xf', zipPath, '-C', BIN_DIR], { windowsHide: true })
    // zip 里是 upscayl-bin-<tag>-<os>/upscayl-bin，拍平到 BIN_DIR
    const { readdir } = await import('node:fs/promises')
    for (const entry of await readdir(BIN_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const { rename, readdir: rd } = await import('node:fs/promises')
        for (const f of await rd(join(BIN_DIR, entry.name))) {
          await rename(join(BIN_DIR, entry.name, f), join(BIN_DIR, f))
        }
      }
    }
    if (process.platform !== 'win32') await chmod(exePath, 0o755)
    if (!(await exists(exePath))) throw new Error(`解压后未找到 ${exe}，请检查 ${BIN_DIR}`)
    const { unlink } = await import('node:fs/promises')
    await unlink(zipPath).catch(() => {})
  }

  if (!(await exists(paramPath))) {
    await mkdir(modelDir, { recursive: true })
    const zipPath = join(MODEL_DIR, 'dl-models.zip')
    process.stderr.write('↓ 首次使用，下载超分模型（~50MB，一次性）...\n')
    await download(MODEL_ZIP, zipPath, '模型')
    await run('tar', ['-xf', zipPath, '-C', MODEL_DIR, 'models/realesrgan-x4plus.param', 'models/realesrgan-x4plus.bin', 'models/realesrgan-x4plus-anime.param', 'models/realesrgan-x4plus-anime.bin'], { windowsHide: true })
    const { rename, rm } = await import('node:fs/promises')
    for (const f of ['realesrgan-x4plus.param', 'realesrgan-x4plus.bin', 'realesrgan-x4plus-anime.param', 'realesrgan-x4plus-anime.bin']) {
      await rename(join(MODEL_DIR, 'models', f), join(modelDir, f)).catch(() => {})
    }
    await rm(join(MODEL_DIR, 'models'), { recursive: true, force: true }).catch(() => {})
    await rm(zipPath, { force: true }).catch(() => {})
    if (!(await exists(paramPath))) throw new Error(`模型解压失败，请检查 ${modelDir}`)
  }

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
