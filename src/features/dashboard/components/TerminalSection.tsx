import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuCopy } from 'react-icons/lu'
import { useCopy } from '@/hooks/use-copy'
import { CodeHighlight } from '@/components/ui/CodeHighlight'
import { PLAIN_CODES, CLI_CODE } from '../constants/code-snippets'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
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
  const { copy, copied } = useCopy()

  const handleCopy = async () => {
    await copy(getCode(activeTab))
    appToast.success(t('terminalSection.toast.copied'))
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="code-terminal-shell">
      {/* IDE 窗口顶栏 */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        height: '46px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        {/* 左侧：Mac 三色按钮胶囊与 Tab */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', marginRight: '16px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56', display: 'inline-block', opacity: 0.85, boxShadow: '0 0 2px rgba(255, 95, 86, 0.4)' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e', display: 'inline-block', opacity: 0.85, boxShadow: '0 0 2px rgba(255, 189, 46, 0.4)' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f', display: 'inline-block', opacity: 0.85, boxShadow: '0 0 2px rgba(39, 201, 63, 0.4)' }}></span>
          </div>

          {/* Tab 切换 */}
          <TabsList variant="pills" className="bg-white/5 border-white/10 p-0.5">
            {TAB_LABELS.map((tab) => (
              <TabsTrigger
                key={tab.key}
                variant="pills"
                value={tab.key}
                className="px-3 py-1 text-[11px] font-mono data-[state=active]:bg-brand-base/20 data-[state=active]:text-brand-base data-[state=active]:shadow-none text-mg-text-3 hover:text-white"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* 右侧：复制键 */}
        <Button
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          className="text-mg-text-3 hover:bg-white/5 rounded-full px-3 py-1 h-7 transition-all border-none flex items-center gap-1 hover:text-white"
        >
          {copied ? <LuCheck className="text-[var(--mg-success)]" /> : <LuCopy className="text-mg-text-3" />}
          {copied ? t('terminalSection.copied') : t('terminalSection.copy')}
        </Button>
      </div>

      {/* 代码渲染区 */}
      {TAB_LABELS.map((tab) => (
        <TabsContent key={tab.key} value={tab.key} className="mt-0">
          <CodeHighlight language={tab.key} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
