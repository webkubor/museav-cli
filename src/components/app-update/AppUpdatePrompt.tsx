/**
 * 新版本强制更新弹窗（全局单例，挂在 App 根部）。
 * 触发：main.tsx 注册 PWA 时 onNeedRefresh → useAppUpdateStore.setUpdateReady(true)。
 * 交互：检测到新版本即弹出，不可关闭（强制更新），点「立即更新」激活新 SW 并整页刷新，
 * 从根上避免「停留旧页面 → 导航加载已被清除的旧 hash chunk → 白屏崩溃」（需求方#233）。
 */
import { LuRocket, LuExternalLink } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useMarket } from '@/hooks/useMarket'
import { getMarketConfig } from '@/config/market'
import { useAppUpdateStore } from '@/store/use-app-update-store'
import { CURRENT_VERSION, formatVersionLine } from '@/lib/app-version'

export function AppUpdatePrompt() {
  const { t } = useTranslation()
  const updateReady = useAppUpdateStore((s) => s.updateReady)
  const updating = useAppUpdateStore((s) => s.updating)
  const applyUpdate = useAppUpdateStore((s) => s.applyUpdate)
  const latestVersion = useAppUpdateStore((s) => s.latestVersion)
  const market = useMarket()
  // 更新日志按环境/市场取文档域名：国内 docs.modelgo.com / 国际 docs.modelgo.ai / 测试 docs.test.modelgo.com
  const changelogUrl = `${getMarketConfig(market).docsUrl}/changelog`

  if (!updateReady) return null

  const currentLine = formatVersionLine(CURRENT_VERSION)
  const latestLine = latestVersion ? formatVersionLine(latestVersion) : ''

  return (
    <Modal
      open
      // 强制更新：不提供关闭入口——onClose 空实现（点遮罩/Esc 不关）+ 隐藏右上角 X
      onClose={() => {}}
      closeButton={false}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <LuRocket size={18} className="text-brand-base" />
          {t('common.appUpdate.title')}
        </span>
      }
      footer={
        <Button variant="brand" className="w-full" loading={updating} onClick={applyUpdate}>
          {updating ? t('common.appUpdate.updating') : t('common.appUpdate.updateNow')}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-mg-text-2">
        {t('common.appUpdate.desc')}
      </p>
      {/* 版本对比：当前运行版本(烘焙) → 服务器最新版本(拉取)。version.json 拉取失败则只显当前。 */}
      <div className="mt-3 space-y-1.5 rounded-md border border-mg-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="shrink-0 text-mg-text-3">{t('common.appUpdate.currentVersion')}</span>
          <span className="truncate font-mono text-mg-text-2" title={currentLine}>{currentLine || '—'}</span>
        </div>
        {latestLine && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="shrink-0 text-mg-text-3">{t('common.appUpdate.latestVersion')}</span>
            <span className="truncate font-mono font-bold text-brand-base" title={latestLine}>{latestLine}</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <a
          href={changelogUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-base transition-colors hover:text-brand-deep"
        >
          {t('common.appUpdate.viewChangelog')}
          <LuExternalLink size={14} />
        </a>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-mg-text-3">
        {t('common.appUpdate.reloadWarning')}
      </p>
    </Modal>
  )
}
