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

async function bootstrap() {
  // MSW 仅在开发模式且有待 mock 接口时启动
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser')
    await worker.start({
      // 未注册 handler 的请求全部穿透到真实后端，不拦截
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
