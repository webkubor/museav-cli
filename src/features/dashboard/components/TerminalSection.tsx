import React, { useState } from 'react'
import { Button, Toast } from '@douyinfe/semi-ui'
import { IconTick, IconCopy } from '@douyinfe/semi-icons'
import { CodeHighlight } from '@/components/ui/CodeHighlight'
import { PLAIN_CODES } from '../constants/code-snippets'

export const TerminalSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'python' | 'node' | 'curl'>('python')
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(PLAIN_CODES[activeTab])
    setCopied(true)
    Toast.success('接入代码已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '14px',
      border: '1px solid rgba(226, 232, 240, 0.7)',
      boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.02)',
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
            {[
              { key: 'python', label: 'main.py' },
              { key: 'node', label: 'index.js' },
              { key: 'curl', label: 'cURL' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
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
          size="small"
          theme="borderless"
          icon={copied ? <IconTick style={{ color: '#10b981' }} /> : <IconCopy style={{ color: '#94a3b8' }} />}
          onClick={handleCopy}
          style={{
            color: copied ? '#10b981' : '#94a3b8',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '6px',
            padding: '4px 10px'
          }}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </div>

      {/* 代码渲染区 */}
      <CodeHighlight language={activeTab} />
    </div>
  )
}
