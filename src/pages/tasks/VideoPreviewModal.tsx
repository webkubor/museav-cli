/**
 * 视频预览弹窗：列表点缩略图时居中弹出，自动播放完整视频。
 * 复用 ui/Modal（Radix Dialog：Esc / 点遮罩关闭、焦点管理）。关闭即卸载 <video> 停止播放。
 */

import { Modal } from '@/components/ui/Modal'

interface VideoPreviewModalProps {
  open: boolean
  url: string | null
  onClose: () => void
}

export function VideoPreviewModal({ open, url, onClose }: VideoPreviewModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="视频预览" size="lg">
      {url && (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          className="w-full rounded-lg bg-black max-h-[70vh]"
        />
      )}
    </Modal>
  )
}
