/**
 * 「指定 API Key」多选下拉——仓库无现成多选组件，基于 Popover + 勾选行自建。
 * 触发器外观对齐 @/components/ui/Select；选项行对齐其 SelectItem 勾选样式。
 * 值为选中的 api_key_id 数组，空数组=不指定（转发所有 Key）。
 */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoChevronDown, IoCheckmark } from 'react-icons/io5'
import { Popover } from '@/components/ui/Popover'
import { cn } from '@/lib/utils'

export interface ApiKeyOption {
  id: string
  name: string
}

export function ApiKeyMultiSelect({
  value,
  onChange,
  options,
  loading,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  options: ApiKeyOption[]
  loading: boolean
}) {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [panelWidth, setPanelWidth] = useState<number>()

  const selectedCount = value.length
  let display: string
  if (selectedCount === 0) {
    display = t('observability.form.apiKeyFilterPlaceholder')
  } else if (selectedCount === 1) {
    display = options.find((option) => option.id === value[0])?.name ?? value[0]
  } else {
    display = t('observability.form.apiKeyFilterCount', { count: selectedCount })
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setPanelWidth(triggerRef.current?.offsetWidth)}
      className="flex h-[var(--mg-control-h-md)] w-full items-center justify-between rounded-lg border border-mg-border bg-mg-fill-0 px-[var(--mg-control-px-sm)] mg-text-body text-mg-text-1 outline-none transition-all duration-200 hover:border-brand-mid/50 focus:border-brand-base focus:ring-2 focus:ring-brand-glow"
    >
      <span className={cn('line-clamp-1 text-left', selectedCount === 0 && 'text-mg-text-3/70')}>{display}</span>
      <IoChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </button>
  )

  return (
    <Popover
      className="p-[var(--mg-menu-padding)]"
      trigger={trigger}
      content={
        <div
          style={panelWidth ? { width: panelWidth } : undefined}
          className="max-h-[240px] overflow-y-auto"
        >
          {loading ? (
            <div className="px-2 py-[var(--mg-menu-item-py)] pl-8 mg-text-body text-mg-text-3 opacity-70">
              {t('common.loading')}
            </div>
          ) : options.length === 0 ? (
            <div className="px-2 py-[var(--mg-menu-item-py)] pl-8 mg-text-body text-mg-text-3 opacity-70">
              {t('observability.form.noApiKeys')}
            </div>
          ) : (
            options.map((option) => {
              const checked = value.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.id)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-lg py-[var(--mg-menu-item-py)] pl-8 pr-2 mg-text-body outline-none transition-colors duration-150 hover:bg-mg-fill-0',
                    checked ? 'text-mg-text-1' : 'text-mg-text-2 hover:text-mg-text-1',
                  )}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {checked && <IoCheckmark className="h-4 w-4 text-brand-base" />}
                  </span>
                  <span className="line-clamp-1 text-left">{option.name}</span>
                </button>
              )
            })
          )}
        </div>
      }
    />
  )
}
