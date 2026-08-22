import { useState } from 'react'
import { iconSvgFor } from '@model-go/icons'
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

interface ModelIconProps {
  model: ModelIconLike
  /** 像素尺寸，默认 32 */
  size?: number
  /** 圆角 className，默认 rounded-md */
  rounded?: string
  /** 附加 className（边框、背景、外边距等） */
  className?: string
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
export function ModelIcon({ model, size = 32, rounded = 'rounded-md', className }: ModelIconProps) {
  const [imgError, setImgError] = useState(false)
  // logo_url 变化时在渲染期重置加载失败标记（react.dev: adjusting state when a prop changes）
  const [prevLogoUrl, setPrevLogoUrl] = useState(model.logo_url)
  if (prevLogoUrl !== model.logo_url) {
    setPrevLogoUrl(model.logo_url)
    setImgError(false)
  }

  const box = cn('shrink-0 inline-flex items-center justify-center overflow-hidden', rounded, className)
  const logo = model.logo_url
  const vendor = modelIconVendor(model)
  // 真实图片 URL（http(s) / data / 绝对路径）才当 <img>，其余按图标名交给包解析
  const isImageUrl = !!logo && /^(https?:|data:|\/)/.test(logo)

  if (logo && isImageUrl && !imgError) {
    return (
      <img
        src={logo}
        alt={vendor ?? model.display_name}
        style={{ width: size, height: size }}
        className={cn(box, 'object-contain')}
        onError={() => setImgError(true)}
      />
    )
  }

  const hit = iconSvgFor({
    icon: isImageUrl ? null : logo,
    vendor,
    name: model.display_name,
  })

  if (hit) {
    return (
      <span
        // 包里的 SVG 用 width/height="1em"，所以尺寸靠 fontSize 给；单色图标走
        // currentColor，会继承此处的文字色，深浅主题自动跟随
        style={{ width: size, height: size, fontSize: Math.round(size * 0.9) }}
        className={box}
        // SVG 来自本仓依赖的产物（构建期内联），非用户输入
        dangerouslySetInnerHTML={{ __html: hit.svg }}
      />
    )
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(box, 'bg-mg-fill-0 font-bold text-mg-text-3 uppercase')}
    >
      {getFallbackAvatarText(vendor ?? model.display_name)}
    </span>
  )
}
