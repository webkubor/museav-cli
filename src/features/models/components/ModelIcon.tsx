import { useState, type ReactNode } from 'react'
import { cn, getFallbackAvatarText } from '@/lib/utils'
import { resolveVendorIcon, resolveLobehubIcon, inferVendorByModelName } from './vendor-icons'

/** 渲染模型图标所需的最小字段（CatalogModelItem / CatalogModelDetail 均兼容） */
export interface ModelIconLike {
  logo_url?: string | null
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
 * 统一的模型图标组件。四层兜底，全站复用：
 * 1. model.logo_url（后端 logo）
 * 2. 本地图标库 resolveVendorIcon(vendor)（含包含匹配）
 * 3. 模型名前缀推断 inferVendorByModelName（logs/usage/tasks 无 vendor 时兜底）
 * 4. 厂商名首字母文字块
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
  const iconSize = Math.round(size * 0.9)
  const logo = model.logo_url
  // 真实图片 URL（http(s) / data / 绝对路径）才当 <img>，其余按 lobehub 组件名解析
  const isImageUrl = !!logo && /^(https?:|data:|\/)/.test(logo)

  if (logo && isImageUrl && !imgError) {
    return (
      <img
        src={logo}
        alt={model.vendor ?? model.display_name}
        style={{ width: size, height: size }}
        className={cn(box, 'object-contain')}
        onError={() => setImgError(true)}
      />
    )
  }

  // 依次尝试：lobehub 组件名 → vendor 本地映射 → 模型名前缀推断（logs/usage/tasks 无 vendor 时兜底）
  const icon: ReactNode =
    (logo && !isImageUrl ? resolveLobehubIcon(logo, iconSize) : null) ??
    resolveVendorIcon(model.vendor, iconSize) ??
    resolveVendorIcon(inferVendorByModelName(model.vendor), iconSize) ??
    // vendor（如 logs 的 provider.name）无法解析时，再用模型名反查（deepseek-v4 → deepseek）
    resolveVendorIcon(inferVendorByModelName(model.display_name), iconSize)
  if (icon) {
    return (
      <span style={{ width: size, height: size }} className={box}>
        {icon}
      </span>
    )
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(box, 'bg-mg-fill-0 font-bold text-mg-text-3 uppercase')}
    >
      {getFallbackAvatarText(model.vendor ?? model.display_name)}
    </span>
  )
}
