/**
 * 专项榜柱顶数值标签（#1059「数字显示会丢失」）。
 *
 * 根因是两层叠加，两层都得钉住：
 * ① recharts 的 <Bar> 只在 `!isAnimating` 时才把 entries 放进 CartesianLabelListContext
 *    （见 recharts/lib/cartesian/Bar.js 的 showLabels）——开着入场动画，标签整批不渲染。
 * ② 自定义 label content 在 recharts 3 里通过 viewBox 拿位置；原先只解构散开的
 *    x/y/width，宽度恒为 0，防重叠判定恒成立，奇数位标签被无条件丢掉。
 */
import { describe, expect, it } from 'vitest'
// 读源码断言而非渲染：这两条不变量都是「组件必须这么写」，渲染测反而要 mock 掉
// ResponsiveContainer 的尺寸，把真正要钉的东西 mock 没了
import src from './discovery-charts.tsx?raw'
const specialtyBar = src.slice(src.indexOf('export function SpecialtyBarChart'))

describe('SpecialtyBarChart 的数值标签', () => {
  it('柱子不开入场动画——开了 recharts 会在动画期间整批不渲染标签', () => {
    expect(specialtyBar).toMatch(/isAnimationActive=\{false\}/)
  })

  it('标签位置从 viewBox 取，不依赖散开的 x/y/width', () => {
    const label = src.slice(src.indexOf('function SpecialtyBarLabel'), src.indexOf('export function SpecialtyBarChart'))
    expect(label).toMatch(/viewBox\s*\?\?/)
    expect(label).toMatch(/box\.width/)
  })

  it('量不出宽度时按「不拥挤」处理——整排数字消失比挨近更糟', () => {
    const label = src.slice(src.indexOf('function SpecialtyBarLabel'), src.indexOf('export function SpecialtyBarChart'))
    expect(label).toMatch(/w > 0 &&/)
  })
})

/**
 * X 轴刻度的模型名（prd46#1065）。只留厂牌图标时，同厂商多模型上榜会连排几个
 * 一模一样的 OpenAI / DeepSeek 图标，横轴完全分不出是哪个模型。
 */
describe('SpecialtyBarChart 的 X 轴刻度', () => {
  const tick = src.slice(src.indexOf('function BrandIconTick'), src.indexOf('interface SpecialtyTooltipProps'))

  it('图标下方渲染模型名，不是只有图标', () => {
    expect(tick).toMatch(/model-discovery-axis-name/)
    expect(tick).toMatch(/\{row\.model\}/)
  })

  it('模型名实测有 67 字符，截断后必须有 title 兜出全名', () => {
    expect(tick).toMatch(/title=\{row\.model\}/)
  })
})
