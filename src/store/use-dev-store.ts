import { create } from 'zustand'

const KEY = 'dev:show-requirements'
const COUNT_KEY = 'dev:mock-member-count'

function readBool(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

function readCount(): number {
  try {
    return Number(localStorage.getItem(COUNT_KEY)) || 0
  } catch {
    return 0
  }
}

interface DevState {
  /** 是否显示需求看板（仅开发环境） */
  showRequirements: boolean
  setShowRequirements: (v: boolean) => void
  /** mock 组织成员数量（>0 时用假数据覆盖 listTenantMembers，0=关闭，仅开发环境） */
  mockMemberCount: number
  setMockMemberCount: (n: number) => void
}

export const useDevStore = create<DevState>()((set) => ({
  showRequirements: readBool(),
  setShowRequirements: (v) => {
    try {
      localStorage.setItem(KEY, String(v))
    } catch {
      /* ignore */
    }
    set({ showRequirements: v })
  },
  mockMemberCount: readCount(),
  setMockMemberCount: (n) => {
    const v = Math.max(0, Math.floor(n))
    try {
      localStorage.setItem(COUNT_KEY, String(v))
    } catch {
      /* ignore */
    }
    set({ mockMemberCount: v })
  },
}))
