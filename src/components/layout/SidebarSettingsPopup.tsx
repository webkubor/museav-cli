import React from 'react'
import { LuUser, LuBuilding } from 'react-icons/lu'
import { cn } from '@/lib/utils'

interface SidebarSettingsPopupProps {
  isOpen: boolean
  collapsed: boolean
  selectedKey: string
  accountLabel: string
  orgLabel: string
  handleItemClick: (key: string) => void
}

export const SidebarSettingsPopup: React.FC<SidebarSettingsPopupProps> = ({
  isOpen,
  collapsed,
  selectedKey,
  accountLabel,
  orgLabel,
  handleItemClick,
}) => {
  if (!isOpen) return null

  return (
    <div
      className={cn(
        "absolute bg-mg-bg-1/90 backdrop-blur-xl modal-glow-flow rounded-lg p-2 flex flex-col gap-1 transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-2 z-[70]",
        collapsed
          ? "left-full bottom-0 ml-3 w-48"
          : "bottom-full left-2 right-2 mb-2"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleItemClick('settings/account')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleItemClick('settings/account')
        }}
        className={cn(
          "group/item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[13.5px] font-medium leading-none select-none transition-all outline-none",
          selectedKey === 'settings/account'
            ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
            : "text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/30 active:scale-[0.98] hover:translate-x-[2px]"
        )}
      >
        <LuUser
          size={14}
          className={cn(
            "transition-transform duration-300 group-hover/item:scale-110",
            selectedKey === 'settings/account' ? "text-brand-base" : "text-mg-text-3 group-hover/item:text-mg-text-0"
          )}
        />
        <span>{accountLabel}</span>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleItemClick('settings/organization')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleItemClick('settings/organization')
        }}
        className={cn(
          "group/item flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[13.5px] font-medium leading-none select-none transition-all outline-none",
          selectedKey === 'settings/organization'
            ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
            : "text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/30 active:scale-[0.98] hover:translate-x-[2px]"
        )}
      >
        <LuBuilding
          size={14}
          className={cn(
            "transition-transform duration-300 group-hover/item:scale-110",
            selectedKey === 'settings/organization' ? "text-brand-base" : "text-mg-text-3 group-hover/item:text-mg-text-0"
          )}
        />
        <span>{orgLabel}</span>
      </div>
    </div>
  )
}
