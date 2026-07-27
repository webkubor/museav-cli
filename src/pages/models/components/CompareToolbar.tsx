import { useState } from 'react'
import { LuColumns2, LuPlus, LuLogOut } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import '../styles/compare-toolbar.css'

/**
 * 对比工具栏（PRD §7.3）
 * 展示「模型对比」标题、当前任务、模型数量、同步输入开关、添加模型、退出对比。
 * 图标固定用双页 Columns（语义最接近的对比图标），文字统一走深色 token，不使用链接蓝。
 */
export interface CompareToolbarProps {
  task: string
  /** 当前对比模型数 (1-3) */
  modelCount: number
  syncInput: boolean
  onSyncInputChange: (sync: boolean) => void
  /** 打开模型选择弹窗（外部处理，本组件只触发） */
  onAddModel: () => void
  /** 内部先弹确认框，确认后再调用这个回调 */
  onExitCompare: () => void
  /** modelCount < 3 时可以添加 */
  canAddModel: boolean
}

export function CompareToolbar({
  task,
  modelCount,
  syncInput,
  onSyncInputChange,
  onAddModel,
  onExitCompare,
  canAddModel,
}: CompareToolbarProps) {
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

  return (
    <div className="compare-toolbar">
      <div className="compare-toolbar__left">
        <span className="compare-toolbar__icon" aria-hidden="true">
          <LuColumns2 size={15} />
        </span>
        <span className="compare-toolbar__title">模型对比</span>
        {task && (
          <span className="compare-toolbar__task" title={task}>
            {task}
          </span>
        )}
        <Badge variant="secondary" size="sm">
          {modelCount} 个模型
        </Badge>
      </div>

      <div className="compare-toolbar__right">
        <label className="compare-toolbar__sync">
          <Switch checked={syncInput} onCheckedChange={onSyncInputChange} />
          <span>同步输入</span>
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={onAddModel}
          disabled={!canAddModel}
          className="rounded-md"
        >
          <LuPlus size={14} />
          添加模型
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExitConfirmOpen(true)}
          className="rounded-md text-mg-text-2"
        >
          <LuLogOut size={14} />
          退出对比
        </Button>
      </div>

      <ConfirmModal
        open={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        onConfirm={() => {
          setExitConfirmOpen(false)
          onExitCompare()
        }}
        title="退出对比"
        description="退出后将只保留最左侧主模型及其对话内容，其余对比列会被移除。"
        confirmLabel="退出对比"
        cancelLabel="取消"
      />
    </div>
  )
}

export default CompareToolbar
