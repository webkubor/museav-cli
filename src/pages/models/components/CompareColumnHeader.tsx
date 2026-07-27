import * as React from 'react'
import { useState } from 'react'
import { LuCode, LuSettings, LuTrash2 } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { cn } from '@/lib/utils'
import '../styles/compare-column-header.css'

/**
 * 对比列头：模型选择、价格、API、设置、移除。
 * 移除先弹「移除模型」确认框，确认后删除该列聊天记录；单模型列不可移除。
 */
export interface CompareColumnHeaderProps {
  modelName: string
  modelIcon?: React.ReactNode
  price: string
  /** 点模型名/图标区域，打开选择器（外部处理） */
  onChangeModel: () => void
  onOpenApi: () => void
  onOpenSettings: () => void
  /** 内部先弹「移除模型」确认框，确认后调用 */
  onRemove: () => void
  /** 单模型列不可移除 */
  removable: boolean
  className?: string
}

export function CompareColumnHeader({
  modelName,
  modelIcon,
  price,
  onChangeModel,
  onOpenApi,
  onOpenSettings,
  onRemove,
  removable,
  className,
}: CompareColumnHeaderProps) {
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)

  return (
    <div className={cn('compare-column-header', className)}>
      <button
        type="button"
        className="compare-column-header__model"
        onClick={onChangeModel}
        title="更换模型"
      >
        {modelIcon && <span className="compare-column-header__icon">{modelIcon}</span>}
        <span className="compare-column-header__name" title={modelName}>
          {modelName}
        </span>
      </button>

      <span className="compare-column-header__price">{price}</span>

      <div className="compare-column-header__actions">
        <Button variant="ghost" size="icon" onClick={onOpenApi} title="API" aria-label="API">
          <LuCode size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="设置"
          aria-label="设置"
        >
          <LuSettings size={14} />
        </Button>
        {removable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRemoveConfirmOpen(true)}
            title="移除模型"
            aria-label="移除模型"
            className="hover:text-mg-danger"
          >
            <LuTrash2 size={14} />
          </Button>
        )}
      </div>

      <ConfirmModal
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={() => {
          setRemoveConfirmOpen(false)
          onRemove()
        }}
        title="移除模型"
        description={`确定要移除「${modelName}」吗？该列的聊天记录将被删除，此操作不可撤销。`}
        confirmLabel="移除"
        cancelLabel="取消"
        variant="destructive"
      />
    </div>
  )
}

export default CompareColumnHeader
