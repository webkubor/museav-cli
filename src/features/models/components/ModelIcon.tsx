import { useState } from 'react'
import { iconSvgFor, iconSvg, vendorEntryOf, preferredVariant } from '@model-go/icons'
import { cn, getFallbackAvatarText } from '@/lib/utils'
import { modelIconVendor } from './model-icon-vendor'

/** 渲染模型图标所需的最小字段（CatalogModelItem / CatalogModelDetail 均兼容） */
export interface ModelIconLike {
  logo_url?: string | null
  /** 对外模型厂牌；目录卡优先用它，避免内部上游名覆盖用户看到的品牌。 */
  provider?: string | null
  vendor?: string
  display_name: string
}

/**
 * 模型 logo 的语义尺寸档位。像素值的唯一真源是 design-tokens 的 `--mg-logo-size-*`
 * （经 components.css 的 `.mg-logo-<档位>` 类注入），本仓不写数字。
 *
 * 档位按场景密度定，不是 t-shirt 档 —— 各场景差 1~2px 都有出处，强行收敛会在
 * 看不出理由的地方产生视觉变化（见该包 tokens.css 里这组 token 的注释）：
 *   dense 18   任务列表行内 / 选择器对比行的迷你图标
 *   inline 22  用量分析行首 / 详情页相关模型卡
 *   compact 24 对比弹窗 / Dashboard 排行榜
 *   row 28     体验对话消息头像
 *   picker 30  模型选择器 Dialog 列表行
 *   bar 32     Playground / 对比模式模型条（默认档）
 *   card 38    模型广场卡片
 *   panel 40   模型选择器 Dialog 详情面板
 *   hero 48    模型详情页 Hero
 *
 * 需要新档位：先在 design-tokens 里加 token，再在 components.css 加对应类，
 * 不要回到调用点写像素数字。
 */
export type ModelIconVariant =
  | 'dense'
  | 'inline'
  | 'compact'
  | 'row'
  | 'picker'
  | 'bar'
  | 'card'
  | 'panel'
  | 'hero'

interface ModelIconProps {
  model: ModelIconLike
  /** 语义尺寸档位，默认 bar。刻意不收数字 —— 数字会绕开 token 真源。 */
  variant?: ModelIconVariant
  /** 圆角 className，默认 rounded-md */
  rounded?: string
  /** 附加 className（边框、背景、外边距等） */
  className?: string
  /**
   * 解析口径。默认 `model` —— 走包的 `iconSvgFor`，**跟随让位**：`data/brands.json`
   * 的 `iconFrom` 让公司条目把图标让给旗下模型族（Alibaba→Qwen、Google→Gemini、
   * Anthropic→Claude 等 10 条）。模型卡片必须走这条，而且它就是 #791 的修复本身：
   * 线上有 vendor=alibaba 且 logo_url 为空的模型（通义千问 embedding 系列），
   * 靠让位才拿到千问图标，包里有回归测试锁着。
   *
   * `vendor` 口径**不让位**，取厂商归属条目自己的图标。只给「按厂商筛选」这类
   * 维度本身就是公司的场景用 —— 那里让位会让 Alibaba 和 Qwen 两个并列筛选项
   * 长成同一个图标，用户分不出差在哪（qa#699 走查）。
   */
  resolve?: 'model' | 'vendor'
}

/**
 * 统一的模型图标组件，全站复用。
 *
 * 解析逻辑在 `@model-go/icons` 里（厂牌图标 + vendor 别名索引 + 厂牌主色的唯一真源，
 * 与运营后台共用同一份），本组件只负责渲染与兜底：
 *   1. logo_url 是真实图片 URL → `<img>`（加载失败回退到下面几层）
 *   2. 交给包解析：logo_url（图标名）→ vendor（含别名）→ 模型名前缀
 *   3. 都不中 → 厂商名首字母文字块
 *
 * 为什么解析要放包里：控制台与运营后台原先各写一份 vendor 映射（45 条 vs 13 条、
 * 各缺对方的条目），运营能选到控制台渲染不出的图标，就会静默掉到名字推断 ——
 * 通义千问的 text-embedding-v4 因此渲染出 OpenAI 图标（需求方 #791）。
 */
export function ModelIcon({
  model,
  variant = 'bar',
  rounded = 'rounded-md',
  className,
  resolve = 'model',
}: ModelIconProps) {
  const [imgError, setImgError] = useState(false)
  // logo_url 变化时在渲染期重置加载失败标记（react.dev: adjusting state when a prop changes）
  const [prevLogoUrl, setPrevLogoUrl] = useState(model.logo_url)
  if (prevLogoUrl !== model.logo_url) {
    setPrevLogoUrl(model.logo_url)
    setImgError(false)
  }

  // 盒子尺寸与字号都由 .mg-logo-<档位> 注入的 --logo-box 推导，组件不算像素
  const box = cn(
    'mg-logo shrink-0 inline-flex items-center justify-center overflow-hidden',
    `mg-logo-${variant}`,
    rounded,
    className,
  )
  const logo = model.logo_url
  const vendor = modelIconVendor(model)
  // 真实图片 URL（http(s) / data / 绝对路径）才当 <img>，其余按图标名交给包解析
  const isImageUrl = !!logo && /^(https?:|data:|\/)/.test(logo)

  if (logo && isImageUrl && !imgError) {
    return (
      <img
        src={logo}
        alt={vendor ?? model.display_name}
        className={cn(box, 'object-contain')}
        onError={() => setImgError(true)}
      />
    )
  }

  // 厂商口径：只认 vendor 归属条目，不看 logo_url、不推名字、不跟随让位。
  // 认不出时返回 null，自然落到下面的首字母块（与 model 口径同一套兜底）。
  const vendorHit = (() => {
    if (resolve !== 'vendor') return null
    const entry = vendorEntryOf(vendor)
    if (!entry) return null
    const svg = iconSvg(entry.slug, preferredVariant(entry))
    return svg ? { svg } : null
  })()

  const hit =
    vendorHit ??
    (resolve === 'vendor'
      ? null
      : iconSvgFor({
          icon: isImageUrl ? null : logo,
          vendor,
          name: model.display_name,
        }))

  if (hit) {
    return (
      <span
        // 包里的 SVG 用 width/height="1em"，所以尺寸靠字号给 —— .mg-logo-glyph
        // 按 --logo-box 比例算。单色图标走 currentColor，会继承此处的文字色，
        // 深浅主题自动跟随
        className={cn(box, 'mg-logo-glyph')}
        // SVG 来自本仓依赖的产物（构建期内联），非用户输入
        dangerouslySetInnerHTML={{ __html: hit.svg }}
      />
    )
  }

  return (
    <span className={cn(box, 'mg-logo-text', 'bg-mg-fill-0 font-bold text-mg-text-3 uppercase')}>
      {getFallbackAvatarText(vendor ?? model.display_name)}
    </span>
  )
}
