/**
 * 输入→输出模态流的单个标记。原型文本模态用字母「T」，不是图标（qa#286）；
 * 其余模态（图像/音频/视频）仍用图标区分。
 *
 * 原在 CatalogCard 内部，需求方 #834 的体验页模型卡片要用同一套标记，
 * 上提到 features/models 供两处共用（两边各画一份必然渐渐走样）。
 */
import { LuImage, LuMic, LuVideo } from 'react-icons/lu'
import type { IconType } from 'react-icons'

const MODALITY_ICON: Record<string, IconType> = { image: LuImage, audio: LuMic, video: LuVideo }

export function ModalityMark({ m, title, size = 12 }: { m: string; title: string; size?: number }) {
  if (m === 'text') return <span className="mg-mcard-flow-text" title={title}>T</span>
  const Icon = MODALITY_ICON[m]
  return Icon ? <Icon size={size} title={title} /> : null
}
