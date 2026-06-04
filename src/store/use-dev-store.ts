import { create } from 'zustand'

const KEY = 'dev:show-requirements'
const COUNT_KEY = 'dev:mock-member-count'
const GUARDRAIL_COUNT_KEY = 'dev:mock-guardrail-count'
const SHOW_CONFIG_KEY = 'dev:show-platform-config'

function readBool(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

function readCount(): number {
  try {
    return Number(localStorage.getItem(COUNT_KEY)) || 0
  } catch {
    return 0
  }
}

function readGuardrailCount(): number {
  try {
    return Number(localStorage.getItem(GUARDRAIL_COUNT_KEY)) || 0
  } catch {
    return 0
  }
}

function readShowConfig(): boolean {
  try {
    const item = localStorage.getItem(SHOW_CONFIG_KEY)
    return item === null ? true : item === 'true'
  } catch {
    return true
  }
}

interface DevState {
  /** 是否显示需求看板（仅开发环境） */
  showRequirements: boolean
  setShowRequirements: (v: boolean) => void
  /** mock 组织成员数量（>0 时用假数据覆盖 listTenantMembers，0=关闭，仅开发环境） */
  mockMemberCount: number
  setMockMemberCount: (n: number) => void
  /** mock 安全护栏数量（>0 时用假数据覆盖安全护栏服务，0=关闭，仅开发环境） */
  mockGuardrailCount: number
  setMockGuardrailCount: (n: number) => void
  /** 是否在侧边栏显示接口调试菜单（仅开发环境） */
  showPlatformConfig: boolean
  setShowPlatformConfig: (v: boolean) => void
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
  mockGuardrailCount: readGuardrailCount(),
  setMockGuardrailCount: (n) => {
    const v = Math.max(0, Math.floor(n))
    try {
      localStorage.setItem(GUARDRAIL_COUNT_KEY, String(v))
    } catch {
      /* ignore */
    }
    set({ mockGuardrailCount: v })
  },
  showPlatformConfig: readShowConfig(),
  setShowPlatformConfig: (v) => {
    try {
      localStorage.setItem(SHOW_CONFIG_KEY, String(v))
    } catch {
      /* ignore */
    }
    set({ showPlatformConfig: v })
  },
}))
