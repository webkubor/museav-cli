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
    <div style={{
      background: 'var(--mg-bg-1)',
      borderRadius: '14px',
      border: '1px solid var(--mg-border)',
      boxShadow: 'var(--semi-shadow-elevated)',
      overflow: 'hidden'
    }}>
      {/* IDE 窗口顶栏 */}
      <div style={{
        backgroundColor: '#0f172a',
        height: '46px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        {/* 左侧：Mac 三色按钮胶囊 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ff5f56', display: 'inline-block' }}></span>
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ffbd2e', display: 'inline-block' }}></span>
          <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27c93f', display: 'inline-block' }}></span>

          {/* 仿真 Tab 切换 */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '20px' }}>
            {TAB_LABELS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'monospace',
                  backgroundColor: activeTab === tab.key ? '#1e293b' : 'transparent',
                  color: activeTab === tab.key ? '#38bdf8' : '#64748b'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.key) {
                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.key) {
                    (e.currentTarget as HTMLElement).style.color = '#64748b';
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
          className="text-[#94a3b8] bg-white/4 rounded-[6px] px-2.5 py-1 h-7 transition-all border-none flex items-center gap-1 hover:text-white"
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
