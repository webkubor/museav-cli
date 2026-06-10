import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import './i18n'
import App from './App.tsx'

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
