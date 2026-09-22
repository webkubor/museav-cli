#!/usr/bin/env node
/**
 * check-orb-theme —— 客服状态球的配色必须从品牌色派生，不许写死。
 *
 * 背景（prd#1061 口径，owner 2026-09-18 报「1.0.7 的皮肤没有随着我的主题色变化」）：
 * ai-orb 自带橙色系（--ao-hi #ffc79a / --ao-mid #ff8a50 / --ao-lo #e8632f），
 * 而 SupportOrb 的注释写着「配色由控制台 CSS 接管」—— 接是打算接的，那份 CSS
 * 一直没写，于是球在任何市场、任何明暗下都是橙的，与品牌色完全脱节。
 *
 * 这类错不报错、不崩溃、类型检查也过，只有人打开页面盯着看才发现。
 *
 * 为什么是脚本不是 vitest 用例：它要读 CSS 源文件做静态检查。本仓是浏览器应用的
 * tsconfig，测试里 import node:fs 会让构建用的 `tsc -b` 报 TS2591
 * （`tsc --noEmit` 却能过 —— 第一版就是这么本地全绿、Jenkins test #993 挂掉的）；
 * 改用 import.meta.glob + ?raw 读 CSS 又拿到空串（vite 把 CSS 当模块处理，raw 不生效）。
 * 静态检查本来就该和 check-css-tokens 同类，走 Node 脚本。
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = join(root, 'src/components/customer-service/support-orb-theme.css')
const tsxPath = join(root, 'src/components/customer-service/support-orb.tsx')

/** ai-orb 暴露给外部覆盖的四个配色变量。库升级改名时这里要跟着核。 */
const ORB_VARS = ['--ao-hi', '--ao-mid', '--ao-lo', '--ao-glow']

const errors = []
const ok = []

if (!existsSync(cssPath)) {
  errors.push('缺 support-orb-theme.css —— 球会落回 ai-orb 的默认橙')
} else {
  const css = readFileSync(cssPath, 'utf8')
  const tsx = existsSync(tsxPath) ? readFileSync(tsxPath, 'utf8') : ''

  if (/import\s+['"]\.\/support-orb-theme\.css['"]/.test(tsx)) {
    ok.push('样式表已被 support-orb.tsx 引入')
  } else {
    errors.push('support-orb.tsx 没有 import support-orb-theme.css —— 只写 CSS 不引等于没写')
  }

  for (const v of ORB_VARS) {
    if (css.includes(v + ':')) ok.push(v + ' 已接管')
    else errors.push(v + ' 没被覆盖，会落回 ai-orb 的默认橙')
  }

  const decls = [...css.matchAll(/--ao-[\w-]+:\s*([^;]+);/g)].map((m) => m[1].trim())
  for (const d of decls) {
    if (!/var\(--brand-(base|mid)\)/.test(d)) {
      errors.push('"' + d + '" 没从品牌色派生')
    }
    const hex = d.match(/#(?!fff\b|000\b)[0-9a-fA-F]{3,8}/)
    if (hex) errors.push('"' + d + '" 写死了色值 ' + hex[0] + '（只有 color-mix 的 #fff/#000 两端允许）')
  }
  if (decls.length > 0 && errors.length === 0) ok.push(decls.length + ' 条声明全部从品牌色派生')

  const darkAt = css.indexOf("[data-theme='dark']")
  if (darkAt < 0) {
    errors.push('没有深色档 —— 深色背景上直接用 brand-base 会让球糊进背景')
  } else if (!css.slice(darkAt).includes('var(--brand-mid)')) {
    errors.push('深色档没用 --brand-mid（库给的提亮版），与 --mg-nav-text-active 同一个理由')
  } else {
    ok.push('深色档存在且用 --brand-mid 提亮版')
  }

  const mixes = [...css.matchAll(/color-mix\(([^,]+),/g)].map((m) => m[1].trim())
  const bad = mixes.filter((m) => m !== 'in oklab')
  if (bad.length) errors.push('color-mix 用了 ' + bad.join('/') + '，必须 in oklab —— srgb 下提亮压暗会掉饱和发灰')
  else if (mixes.length) ok.push(mixes.length + ' 处 color-mix 均走 oklab')
}

console.log('\n客服状态球配色')
for (const o of ok) console.log('  \u001b[32m✓\u001b[0m ' + o)
if (errors.length) {
  for (const e of errors) console.log('  \u001b[31m✗\u001b[0m ' + e)
  console.log('')
  process.exit(1)
}
console.log('')
