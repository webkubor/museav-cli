/**
 * 任务列表「预览」列单元。
 * - 已完成的视频任务：首帧缩略图（命中缓存用 <img>，否则 <video> 显首帧并后台抓帧缓存），叠 ▶ 可点
 * - 其余任务（未完成 / 图片 / 音乐）：类型图标占位，不可点
 */

import { useState } from 'react'
import { LuPlay, LuVideoOff } from 'react-icons/lu'
import { useVideoThumbnail } from './video-thumbnail-cache'

interface VideoThumbnailProps {
  taskId: string
  /** 可播放的视频地址；为 null 表示非视频或未完成，渲染占位 */
  videoUrl: string | null
  /** 占位图标（非视频/未完成时显示） */
  placeholder: React.ReactNode
  onPreview: (url: string) => void
  /** 视频 404（已被清理）时通知父级，用于列表显示「已过期」文案 */
  onExpired?: () => void
}

const BOX = 'h-12 w-12 shrink-0 rounded-lg overflow-hidden mx-auto'

export function VideoThumbnail({ taskId, videoUrl, placeholder, onPreview, onExpired }: VideoThumbnailProps) {
  // hooks 必须无条件调用：videoUrl 为 null 时 hook 内部自身短路，不抓帧
  const thumb = useVideoThumbnail(taskId, videoUrl)
  // 产物 404（已过期/被清理）：兜底显示过期图标，不可点
  const [failed, setFailed] = useState(false)

  if (!videoUrl || failed) {
    return (
      <div
        className={`${BOX} flex items-center justify-center bg-mg-fill-1 text-mg-text-3`}
        title={failed ? '产物已过期' : undefined}
      >
        {failed ? <LuVideoOff size={20} /> : placeholder}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onPreview(videoUrl) }}
      title="点击预览视频"
      className={`${BOX} group relative block bg-black ring-1 ring-mg-border transition-shadow hover:ring-brand-base`}
    >
      {thumb ? (
        <img src={thumb} alt="视频首帧" className="h-full w-full object-cover" />
      ) : (
        // 抓取中或抓帧失败（CORS）：直接用 <video> 显示首帧兜底；真 404 则标记已过期
        <video
          src={`${videoUrl}#t=0.1`}
          muted
          preload="metadata"
          playsInline
          className="h-full w-full object-cover"
          onError={() => { setFailed(true); onExpired?.() }}
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-90 transition-opacity group-hover:bg-black/35">
        <LuPlay size={16} className="text-white drop-shadow" fill="currentColor" />
      </span>
    </button>
  )
}
