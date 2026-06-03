import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuCopy } from 'react-icons/lu'
import { CodeHighlight } from '@/components/ui/CodeHighlight'
import { PLAIN_CODES, CLI_CODE } from '../constants/code-snippets'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'

type Tab = 'cli' | 'python' | 'node' | 'curl'

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'cli', label: 'CLI' },
  { key: 'python', label: 'main.py' },
  { key: 'node', label: 'index.js' },
  { key: 'curl', label: 'cURL' },
]

function getCode(tab: Tab): string {
  if (tab === 'cli') return CLI_CODE
  return PLAIN_CODES[tab]
}

export const TerminalSection: React.FC = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('cli')
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(getCode(activeTab))
    setCopied(true)
    appToast.success(t('terminalSection.toast.copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div 
      className="glass-card-glow"
      style={{
        borderRadius: '14px',
        overflow: 'hidden'
      }}
    >
      {/* IDE 窗口顶栏 */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        height: '46px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        {/* 左侧：Mac 三色按钮胶囊与 Tab */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', marginRight: '16px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56', display: 'inline-block', opacity: 0.85, boxShadow: '0 0 2px rgba(255, 95, 86, 0.4)' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e', display: 'inline-block', opacity: 0.85, boxShadow: '0 0 2px rgba(255, 189, 46, 0.4)' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f', display: 'inline-block', opacity: 0.85, boxShadow: '0 0 2px rgba(39, 201, 63, 0.4)' }}></span>
          </div>

          {/* 仿真 Tab 切换 */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {TAB_LABELS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  border: '1px solid transparent',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  fontFamily: 'monospace',
                  backgroundColor: activeTab === tab.key ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                  color: activeTab === tab.key ? '#38bdf8' : '#94a3b8',
                  borderColor: activeTab === tab.key ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  boxShadow: activeTab === tab.key ? '0 0 8px rgba(56, 189, 248, 0.1)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.key) {
                    (e.currentTarget as HTMLElement).style.color = '#fff';
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.key) {
                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧：复制键 */}
        <Button
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          className="text-[#94a3b8] hover:bg-white/5 rounded-full px-3 py-1 h-7 transition-all border-none flex items-center gap-1 hover:text-white"
        >
          {copied ? <LuCheck className="text-[var(--mg-success)]" /> : <LuCopy className="text-[#94a3b8]" />}
          {copied ? t('terminalSection.copied') : t('terminalSection.copy')}
        </Button>
      </div>

      {/* 代码渲染区 */}
      <CodeHighlight language={activeTab} />
    </div>
  )
}
