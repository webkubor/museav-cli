import React from 'react'
import { LuUser, LuBuilding2, LuFolderCog } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface SidebarSettingsPopupProps {
  isOpen: boolean
  collapsed: boolean
  selectedKey: string
  accountLabel: string
  spaceLabel: string
  spaceHint: string
  spaceTargetKey: string
  workspaceLabel: string
  handleItemClick: (key: string) => void
}

type SettingsItem = {
  key: string
  targetKey?: string
  label: string
  hint: string
  icon: React.ReactNode
}

export const SidebarSettingsPopup: React.FC<SidebarSettingsPopupProps> = ({
  isOpen,
  collapsed,
  selectedKey,
  accountLabel,
  spaceLabel,
  spaceHint,
  spaceTargetKey,
  workspaceLabel,
  handleItemClick,
}) => {
  const { t } = useTranslation()

  if (!isOpen) return null

  const items: SettingsItem[] = [
    {
      key: 'settings/account',
      label: accountLabel,
      hint: t('sidebarSettings.accountHint'),
      icon: <LuUser size={15} />,
    },
    {
      key: spaceTargetKey === 'settings/account' ? 'settings/personal-space' : spaceTargetKey,
      targetKey: spaceTargetKey,
      label: spaceLabel,
      hint: spaceHint,
      icon: <LuBuilding2 size={15} />,
    },
    {
      key: 'settings/workspace',
      label: workspaceLabel,
      hint: t('sidebarSettings.workspaceHint'),
      icon: <LuFolderCog size={15} />,
    },
  ]

  return (
    <div
      className={cn(
        "absolute bg-mg-bg-1/90 backdrop-blur-xl modal-glow-flow rounded-lg p-2 flex flex-col gap-1 transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-2 z-[70]",
        collapsed
          ? "left-full bottom-0 ml-3 w-60"
          : "bottom-full left-2 right-2 mb-2"
      )}
    >
      {items.map((item) => {
        const isSelected = selectedKey === item.key
        return (
          <div
            key={`${item.key}-${item.label}`}
            role="button"
            tabIndex={0}
            onClick={() => handleItemClick(item.targetKey ?? item.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleItemClick(item.targetKey ?? item.key)
            }}
            className={cn(
              "group/item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none transition-all outline-none",
              isSelected
                ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
                : "text-mg-text-3 hover:text-mg-text-1 hover:bg-mg-fill-0/30 active:scale-[0.98] hover:translate-x-[2px]"
            )}
          >
            <span className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mg-fill-0 text-mg-text-4 transition-all duration-300 group-hover/item:scale-105 group-hover/item:text-mg-text-1",
              isSelected && "bg-brand-selected-bg text-brand-base"
            )}>
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold leading-tight">{item.label}</span>
              <span className="mt-1 block truncate text-[11px] font-medium leading-none text-mg-text-4">
                {item.hint}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
