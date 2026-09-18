/**
 * 客服状态球配色必须从品牌色派生（prd#1061 口径，prd#996 引入时漏了）。
 *
 * ai-orb 默认是橙色系，SupportOrb 的注释写着「配色由控制台 CSS 接管」但一直没接，
 * 于是球在任何市场、任何明暗下都是橙的 —— 而这类错不报错、不崩溃，
 * 只有人打开页面盯着看才发现（owner 2026-09-18：「皮肤没有随着我的主题色变化」）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'support-orb-theme.css'), 'utf8')
const tsx = readFileSync(join(here, 'support-orb.tsx'), 'utf8')

/** ai-orb 暴露给外部覆盖的四个配色变量。库升级改名的话这里要跟着核。 */
const ORB_VARS = ['--ao-hi', '--ao-mid', '--ao-lo', '--ao-glow']

describe('状态球配色', () => {
  it('样式表被真的引入了 —— 只写 CSS 不 import 等于没写', () => {
    expect(tsx).toMatch(/import\s+['"]\.\/support-orb-theme\.css['"]/)
  })

  it('四个配色变量全部被接管', () => {
    for (const v of ORB_VARS) {
      expect(css, `${v} 没被覆盖，会落回 ai-orb 的默认橙`).toContain(`${v}:`)
    }
  })

  it('每个变量都从品牌色派生，不许出现写死的颜色', () => {
    // 取所有 --ao-* 的声明值
    const decls = [...css.matchAll(/--ao-[\w-]+:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(decls.length).toBeGreaterThan(0)
    for (const d of decls) {
      expect(d, `"${d}" 里没有 --brand-*，等于又写死一个颜色`).toMatch(/var\(--brand-(base|mid)\)/)
      expect(d, `"${d}" 含十六进制色值 —— 只有 color-mix 的 #fff/#000 两端允许`)
        .not.toMatch(/#(?!fff\b|000\b)[0-9a-fA-F]{3,8}/)
    }
  })

  it('深色档单独给一套 —— 深色背景上直接用 brand-base 会糊进背景', () => {
    const at = css.indexOf("[data-theme='dark']")
    // indexOf 返回 -1 时 slice(-1) 会截到最后一个字符、断言反而通过 —— 必须先断存在
    expect(at, '没有深色档，球在深色下会糊进背景').toBeGreaterThan(-1)
    // 深色档必须用提亮版 brand-mid，与 --mg-nav-text-active 同一个理由
    expect(css.slice(at)).toContain('var(--brand-mid)')
  })

  it('混色走 oklab —— srgb 下提亮压暗会掉饱和发灰', () => {
    const mixes = [...css.matchAll(/color-mix\(([^,]+),/g)].map((m) => m[1].trim())
    expect(mixes.length).toBeGreaterThan(0)
    for (const m of mixes) expect(m).toBe('in oklab')
  })
})
