const MSW_OVERRIDE_KEY = 'dev_msw'

export function isMswEnabled() {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem(MSW_OVERRIDE_KEY)
    if (override === 'true') return true
    if (override === 'false') return false
  }

  if (import.meta.env.DEV) return import.meta.env.VITE_MOCK !== 'false'
  return import.meta.env.VITE_MOCK === 'true'
}

export function toggleMswOverride() {
  if (typeof window === 'undefined') return
  localStorage.setItem(MSW_OVERRIDE_KEY, isMswEnabled() ? 'false' : 'true')
}
