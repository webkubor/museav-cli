/**
 * 模态标记的两种形态，共用一份「模态 → 图标」映射。
 *
 * - `ModalityMark`：广场卡片的输入→输出模态流。**文本用字母「T」不是图标**（qa#286
 *   逐字对齐原型 marketplace 卡片），其余模态用图标。原在 CatalogCard 内部，
 *   #834 之后上提到这里与体验页共用映射。
 * - `ModalityChip`：体验页空态模型卡片的「图标 + 标签」成对形态，逐字对齐 PRD 原型
 *   `modelgo_prd/src/App.tsx:20954 PlaygroundWelcomeModalities`（图标 size 14、
 *   文本用 lucide `Type`、音频用 `AudioLines`）。两张卡对文本模态的画法本来就不同，
 *   合成一个带开关的组件只会让两边互相牵制，所以分成两个导出。
 */
import { LuAudioLines, LuImage, LuMic, LuType, LuVideo } from 'react-icons/lu'
import type { IconType } from 'react-icons'

/** 广场模态流：文本走字母，这里只放非文本模态 */
const MODALITY_ICON: Record<string, IconType> = { image: LuImage, audio: LuMic, video: LuVideo }

/** 体验页欢迎卡：四种模态都有图标（原型 playgroundWelcomeModalityMeta） */
const WELCOME_MODALITY_ICON: Record<string, IconType> = {
  text: LuType,
  image: LuImage,
  audio: LuAudioLines,
  video: LuVideo,
}

export function ModalityMark({ m, title, size = 12 }: { m: string; title: string; size?: number }) {
  if (m === 'text') return <span className="mg-mcard-flow-text" title={title}>T</span>
  const Icon = MODALITY_ICON[m]
  return Icon ? <Icon size={size} title={title} /> : null
}

export function ModalityChip({ m, label }: { m: string; label: string }) {
  const Icon = WELCOME_MODALITY_ICON[m]
  return (
    <span className="mg-modality-chip">
      {Icon && <Icon size={14} aria-hidden />}
      {label}
    </span>
  )
}
