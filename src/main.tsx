import '@douyinfe/semi-ui/react19-adapter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toast } from '@douyinfe/semi-ui'
import { registerSW } from 'virtual:pwa-register'
import '@douyinfe/semi-ui/dist/css/semi.css'
import './index.css'
import './i18n'
import App from './App.tsx'

registerSW({
  onNeedRefresh() {
    const id = Toast.info({
      content: (
        <span>
          检测到新版本&nbsp;
          <button
            style={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            onClick={() => { Toast.close(id); window.location.reload() }}
          >
            立即刷新
          </button>
        </span>
      ),
      duration: 0,
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
