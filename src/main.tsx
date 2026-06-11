import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import './i18n'
import App from './App.tsx'
import { installDevErrorReporter } from './lib/dev-error-reporter'
import { initDeviceFingerprint } from './lib/device-fingerprint'

installDevErrorReporter()
initDeviceFingerprint()

// 清除历史遗留的 mockServiceWorker.js，防止与 PWA SW 冲突产生疯狂报错
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      if (reg.active?.scriptURL.includes('mockServiceWorker')) {
        reg.unregister()
      }
    })
  })
}

registerSW({
  onNeedRefresh() {
    toast.info('检测到新版本', {
      action: {
        label: '立即刷新',
        onClick: () => window.location.reload(),
      },
      duration: Infinity,
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
