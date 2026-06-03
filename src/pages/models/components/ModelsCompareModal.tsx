import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuX, LuGitCompareArrows } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { CatalogModelItem } from '@/types'
import { ModelIcon } from '@/features/models/components/ModelIcon'

interface ModelsCompareModalProps {
  isOpen: boolean
  onClose: () => void
  allModels: CatalogModelItem[]
  onConfirmCompare?: (ids: string[]) => void
  initialSelectedIds?: string[]
}

const MAX_COMPARE = 3

// 格式化展示单价，若无则显示横线
function formatPrice(val: string | undefined) {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return `$${n.toFixed(4)}`
}

// 格式化上下文长度与输出限制
function formatContext(n: number | undefined) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export const ModelsCompareModal: React.FC<ModelsCompareModalProps> = ({ 
  isOpen, 
  onClose, 
  allModels,
  onConfirmCompare,
  initialSelectedIds = []
}) => {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds)
  const [searchQuery, setSearchQuery] = useState('')

  // 同步初始化对比 IDs
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds)
    }
  }, [isOpen, initialSelectedIds])

  // 监听 Esc 键自动关闭弹窗
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // 过滤出当前选择的模型列表
  const selectedModels = selectedIds
    .map((id) => allModels.find((m) => m.id === id))
    .filter((m): m is CatalogModelItem => !!m)

  // 过滤左侧模型列表，支持中文、ID 和厂商的模糊查询
  const filteredModels = allModels.filter((m) =>
    (m.display_name + m.model_id + (m.vendor ?? '')).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleToggleModel = (modelId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId)
      }
      if (prev.length >= MAX_COMPARE) return prev // 达到最大对比数，拦截
      return [...prev, modelId]
    })
  }

  const handleClearSelected = () => {
    setSelectedIds([])
  }

  // 厂商 Logo 渲染，提供精美后备
  const renderLogo = (m: CatalogModelItem) => (
    <ModelIcon model={m} size={24} rounded="rounded" className="bg-white border border-mg-border/40" />
  )

  // 属性对比定义，在 t() 中增加中文默认后备以解决 key 缺失带来的重叠灾难
  const ROWS: Array<{ label: string; render: (m: CatalogModelItem) => React.ReactNode }> = [
    { label: t('modelsCompare.row.contextLength', '上下文长度'), render: (m) => formatContext(m.context_length) },
    { label: t('modelsCompare.row.maxOutput', '最大输出'), render: (m) => formatContext(m.max_output_tokens) },
    {
      label: t('modelsCompare.row.modalities', '模态支持'),
      render: (m) => (
        <div className="flex gap-1 flex-wrap">
          {(m.modalities ?? []).map((mod) => (
            <Badge key={mod} variant="info" className="py-0 px-1.5 text-[10px] font-semibold leading-relaxed">{mod}</Badge>
          ))}
        </div>
      ),
    },
    { label: t('modelsCompare.row.inputPrice', '输入价格 (百万)'), render: (m) => formatPrice(m.pricing?.input_per_1m) },
    { label: t('modelsCompare.row.outputPrice', '输出价格 (百万)'), render: (m) => formatPrice(m.pricing?.output_per_1m) },
    {
      label: t('modelsCompare.row.tags', '标签'),
      render: (m) => (
        <div className="flex gap-0.5 flex-wrap">
          {(m.tags ?? []).slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="py-0 px-1 text-[9.5px] font-normal leading-relaxed">{tag}</Badge>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/35 backdrop-blur-[12px] animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card-glow w-full max-w-5xl h-[80vh] max-h-[660px] rounded-2xl flex flex-col overflow-hidden relative shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* 顶栏 */}
        <div className="px-6 py-4 border-b border-mg-border flex items-center justify-between shrink-0 bg-mg-fill-0/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-selected-bg text-brand-base flex items-center justify-center">
              <LuGitCompareArrows size={18} />
            </div>
            <div>
              <h2 className="text-[14.5px] font-bold text-mg-text-0 m-0 leading-tight">
                {t('modelsCompare.title') || '模型性能对比'}
              </h2>
              <p className="text-[11px] text-mg-text-2 m-0 mt-0.5">
                最多可选 3 个模型进行对比，当前已选择 <strong className="text-brand-base">{selectedIds.length}</strong> / 3 个
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-mg-fill-0 hover:bg-mg-fill-1 text-mg-text-2 hover:text-mg-text-0 flex items-center justify-center cursor-pointer transition-all active:scale-90"
          >
            <LuX size={16} />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* 左侧：选择模型列表 */}
          <div className="w-[280px] border-r border-mg-border flex flex-col bg-mg-fill-0/5 min-h-0 shrink-0">
            {/* 搜索框 */}
            <div className="p-3 border-b border-mg-border shrink-0">
              <Input
                prefix={<LuSearch size={14} className="text-mg-text-2" />}
                placeholder="搜索模型、ID 或厂商..."
                className="h-8 text-xs rounded-lg bg-mg-fill-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* 滚动模型列表 */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
              {filteredModels.map((m) => {
                const isSelected = selectedIds.includes(m.id)
                const isDisabled = !isSelected && selectedIds.length >= MAX_COMPARE

                return (
                  <div
                    key={m.id}
                    onClick={() => !isDisabled && handleToggleModel(m.id)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all select-none border border-transparent",
                      isSelected
                        ? "bg-brand-selected-bg border-brand-mid/10 text-mg-text-0 font-semibold"
                        : "hover:bg-mg-fill-0/40 text-mg-text-1",
                      isDisabled && "opacity-30 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => {}} // 托管在父 div 响应中
                      className="rounded border-mg-border text-brand-base focus:ring-brand-glow w-3.5 h-3.5 cursor-pointer shrink-0"
                    />
                    {renderLogo(m)}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-mg-text-0 truncate leading-tight">
                        {m.display_name}
                      </div>
                      <div className="text-[10px] text-mg-text-2 truncate font-mono mt-0.5">
                        {m.vendor || 'ModelGo'} · {m.model_id}
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredModels.length === 0 && (
                <div className="py-12 text-center text-xs text-mg-text-2">
                  未匹配到相关模型
                </div>
              )}
            </div>
          </div>

          {/* 右侧：纵向对比区 */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 min-h-0 flex flex-col justify-between bg-mg-fill-0/5">
            {selectedModels.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {selectedModels.map((m) => (
                  <div
                    key={m.id}
                    className="border border-mg-border bg-mg-bg-0 rounded-xl p-4.5 relative shadow-sm hover:border-brand-base transition-all duration-300"
                  >
                    {/* 卡片头部 */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {renderLogo(m)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-mg-text-0 leading-none">{m.display_name}</span>
                            <span className="text-[9.5px] text-brand-base font-semibold px-2 py-0.5 rounded-full bg-brand-selected-bg border border-brand-mid/10">
                              {m.vendor || 'ModelGo'}
                            </span>
                          </div>
                          <div className="text-[10px] text-mg-text-2 font-mono mt-1.5">
                            ID: <span className="select-all text-mg-text-1 font-medium">{m.model_id}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* 取消对比按钮 */}
                      <button
                        onClick={() => handleToggleModel(m.id)}
                        className="w-5.5 h-5.5 rounded-full bg-mg-fill-0 hover:bg-mg-fill-2 text-mg-text-2 hover:text-mg-text-0 flex items-center justify-center transition-colors cursor-pointer"
                        title="取消对比"
                      >
                        <LuX size={12} />
                      </button>
                    </div>

                    {/* 卡片属性网格 (6列自适应) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5 mt-3.5 pt-3.5 border-t border-mg-border">
                      {ROWS.map((row, idx) => (
                        <div key={idx} className="flex flex-col gap-1 min-w-0">
                          <span className="text-[10px] font-bold text-mg-text-2 tracking-wide">
                            {row.label}
                          </span>
                          <span className="text-[12px] font-semibold text-mg-text-0 truncate">
                            {row.render(m)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-16 animate-in fade-in duration-300">
                <div className="w-14 h-14 rounded-full bg-mg-fill-0 flex items-center justify-center text-mg-text-2 border border-mg-border/40">
                  <LuGitCompareArrows size={26} className="opacity-40" />
                </div>
                <div>
                  <h3 className="text-[13.5px] font-bold text-mg-text-1 m-0">请勾选需要对比的模型</h3>
                  <p className="text-[11.5px] text-mg-text-2 m-0 mt-1 max-w-[280px]">
                    在左侧列表中勾选最多 3 个模型，即可在此区域直观展示核心指标、上下文与价格对比。
                  </p>
                </div>
              </div>
            )}

            {/* 底部操作工具栏 */}
            <div className="mt-5 pt-4.5 border-t border-mg-border/50 flex items-center justify-between shrink-0 bg-transparent">
              {selectedModels.length > 0 ? (
                <button
                  onClick={handleClearSelected}
                  className="text-xs text-mg-text-2 hover:text-brand-base font-semibold transition-colors bg-none border-none cursor-pointer active:scale-95"
                >
                  清空对比槽位
                </button>
              ) : (
                <div />
              )}
              
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-mg-fill-0 hover:bg-mg-fill-1 text-mg-text-1 hover:text-mg-text-0 border border-mg-border/30 transition-all cursor-pointer active:scale-95 outline-none"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (onConfirmCompare) {
                      onConfirmCompare(selectedIds)
                    }
                    onClose()
                  }}
                  className="px-6 py-2 rounded-xl text-xs font-bold bg-brand-base text-white hover:bg-brand-deep shadow-md hover:shadow-brand-glow/15 transition-all cursor-pointer active:scale-95 border-none outline-none"
                >
                  确认对比
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
