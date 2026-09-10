import { describe, expect, it } from 'vitest'

import { DISCOVERY_SECTIONS } from './use-section-anchor'

/**
 * 锚点常量是 DOM id / URL hash / 埋点 section 三处的共用真源（qa#726）。
 * 这里只钉住这份清单：id 改名或漏挂，页面上的 section 就观察不到，
 * 而那种失败在浏览器里才看得见、静态检查一条都抓不到。
 */
describe('DISCOVERY_SECTIONS', () => {
  it('保持五个区块且无重复', () => {
    expect(DISCOVERY_SECTIONS).toHaveLength(5)
    expect(new Set(DISCOVERY_SECTIONS).size).toBe(DISCOVERY_SECTIONS.length)
  })

  it('每个 id 都能安全用作 URL hash（无需转义）', () => {
    for (const id of DISCOVERY_SECTIONS) {
      expect(id).toMatch(/^model-discovery-[a-z-]+$/)
      expect(encodeURIComponent(id)).toBe(id)
    }
  })
})
