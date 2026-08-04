import { LuVideoOff, LuDownload } from 'react-icons/lu'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableCell, TableRow } from '@/components/ui/Table'
import { trackEvent } from '@/lib/track'
import { cn } from '@/lib/utils'
import type { TaskItem } from '@/types'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { VideoThumbnail } from './VideoThumbnail'
import { STATUS_CONFIG, KIND_CONFIG, fmtDate, fmtCost, resolveKind, isTaskDone, resultExpiry, isVideoExpired, videoContentUrl } from './task-list-utils'

interface TaskRowProps {
  item: TaskItem
  /** 运行时 404（无 result_meta 的老任务，产物已被清理）：判定为已过期 */
  expired: boolean
  onOpen: (item: TaskItem) => void
  onPreview: (url: string) => void
  onExpired: (taskId: string) => void
}

export function TaskRow({ item, expired, onOpen, onPreview, onExpired }: TaskRowProps) {
  const kind    = resolveKind(item)
  const kindCfg = KIND_CONFIG[kind]
  const expiry  = resultExpiry(item)
  const isVideoTask = kind === 'video' && isTaskDone(item.status)
  // 过期以服务端 artifact_state / result_expires_at / 运行时 404 为准。
  // 缺少有效期字段表示元数据尚未回填，不能直接判定为过期。
  const isExpired =
    item.artifact_state === 'expired' ||
    isVideoExpired(item) ||
    expired
  // 仅未过期的已完成视频任务有可播放/可抓帧的地址
  const videoUrl = isVideoTask && !isExpired
    ? videoContentUrl(item.gateway_request_id)
    : null
  return (
    <TableRow
      key={item.gateway_request_id}
      className="cursor-pointer hover:bg-mg-fill-0/50 transition-colors"
      onClick={() => onOpen(item)}
    >
      <TableCell align="center">
        {isExpired ? (
          <div className="h-[var(--mg-preview-thumb-size)] w-[var(--mg-preview-thumb-size)] shrink-0 rounded-lg mx-auto flex items-center justify-center bg-mg-fill-1 text-mg-text-4" title="产物已过期">
            <LuVideoOff size={20} />
          </div>
        ) : (
          <VideoThumbnail
            taskId={item.gateway_request_id}
            videoUrl={videoUrl}
            placeholder={kindCfg.icon}
            onPreview={onPreview}
            onExpired={() => onExpired(item.gateway_request_id)}
          />
        )}
      </TableCell>
      <TableCell align="center" className="mg-text-caption text-mg-text-2">
        {fmtDate(item.created_at)}
        {(expiry || isExpired) && (
          <p
            className={cn(
              'mg-text-caption mt-0.5',
              isExpired
                ? 'text-[var(--mg-warning)]'        // 已过期 → 黄
                : expiry?.urgent
                  ? 'text-[var(--mg-danger)]'        // 剩 ≤1 天 → 红
                  : 'text-mg-text-3',
            )}
          >
            {isExpired ? '产物已过期' : `产物有效 ${expiry?.remain}`}
          </p>
        )}
      </TableCell>
      <TableCell align="center">
        <span className="inline-flex items-center gap-1.5 mg-text-caption text-mg-text-2">
          {kindCfg.icon}
          {kindCfg.label}
        </span>
      </TableCell>
      <TableCell align="center">
        <span className="inline-flex items-center gap-1.5 max-w-[220px] mx-auto truncate">
          <ModelIcon
            model={{ display_name: item.requested_model, vendor: item.vendor ?? undefined }}
            size={18}
            rounded="rounded-md"
            className="shrink-0"
          />
          <p className="mg-text-code text-mg-text-1 truncate">
            {item.requested_model}
          </p>
        </span>
      </TableCell>
      <TableCell align="center">
        <StatusBadge status={item.status} statusMap={STATUS_CONFIG} />
      </TableCell>
      <TableCell align="center">
        <span className="mg-text-body font-semibold inline-flex items-center">
          {fmtCost(item)}
        </span>
      </TableCell>
      <TableCell align="center">
        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(item)
            }}
            className="mg-text-caption text-mg-text-3 hover:text-mg-text-1 font-semibold transition-colors"
          >
            详情
          </button>
          {/* 下载：仅未过期的已完成视频产物可用；未完成/生成中/失败/过期置灰（TODO(#446) 图片/音乐产物地址待后端交付） */}
          <button
            type="button"
            disabled={!videoUrl}
            title={videoUrl ? '下载产物' : '产物不可下载（未完成 / 生成中 / 失败 / 已过期）'}
            onClick={(e) => {
              e.stopPropagation()
              if (!videoUrl) return
              const a = document.createElement('a')
              a.href = videoUrl
              a.download = ''
              a.target = '_blank'
              a.rel = 'noopener noreferrer'
              a.click()
              trackEvent('logs_artifact_download', { record_type: 'async', kind, source: 'list' })
            }}
            className={cn(
              'inline-flex items-center gap-1 mg-text-caption font-semibold transition-colors',
              videoUrl
                ? 'text-brand-base hover:text-brand-deep'
                : 'text-mg-text-4 cursor-not-allowed',
            )}
          >
            <LuDownload size={13} />
            下载
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}
