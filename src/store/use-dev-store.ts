import { create } from 'zustand'

const KEY = 'dev:show-requirements'

function readInitial(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

interface DevState {
  /** 是否显示需求看板（仅开发环境） */
  showRequirements: boolean
  setShowRequirements: (v: boolean) => void
}

export const useDevStore = create<DevState>()((set) => ({
  showRequirements: readInitial(),
  setShowRequirements: (v) => {
    try {
      localStorage.setItem(KEY, String(v))
    } catch {
      /* ignore */
    }
    set({ showRequirements: v })
  },
}))
