/**
 * 新版本强制更新弹窗（全局单例，挂在 App 根部）。
 * 触发：main.tsx 注册 PWA 时 onNeedRefresh → useAppUpdateStore.setUpdateReady(true)。
 * 交互：检测到新版本即弹出，不可关闭（强制更新），点「立即更新」激活新 SW 并整页刷新，
 * 从根上避免「停留旧页面 → 导航加载已被清除的旧 hash chunk → 白屏崩溃」（需求方#233）。
 */
import { LuRocket } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAppUpdateStore } from '@/store/use-app-update-store'

export function AppUpdatePrompt() {
  const updateReady = useAppUpdateStore((s) => s.updateReady)
  const updating = useAppUpdateStore((s) => s.updating)
  const applyUpdate = useAppUpdateStore((s) => s.applyUpdate)

  if (!updateReady) return null

  return (
    <Modal
      open
      // 强制更新：不提供关闭入口——onClose 空实现（点遮罩/Esc 不关）+ 隐藏右上角 X
      onClose={() => {}}
      closeButton={false}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <LuRocket size={18} className="text-brand-base" />
          发现新版本
        </span>
      }
      footer={
        <Button variant="brand" className="w-full" loading={updating} onClick={applyUpdate}>
          {updating ? '更新中…' : '立即更新'}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-mg-text-2">
        控制台已发布新版本，需更新后继续使用，以获得最新功能与问题修复。
      </p>
      <p className="mt-2 text-xs leading-relaxed text-mg-text-3">
        更新会重新加载页面，请留意未保存的填写内容。
      </p>
    </Modal>
  )
}
