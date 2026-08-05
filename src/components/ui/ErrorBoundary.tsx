import { Component, type ReactNode } from 'react'
import { LuTriangleAlert, LuRotateCw } from 'react-icons/lu'
import { Button } from './Button'
import i18n from '@/i18n'

interface Props {
  children: ReactNode
  /** 变化时重置错误态（如路由 pathname 变化，切页后自动恢复） */
  resetKey?: string
  /** 自定义降级 UI；不传用默认卡片 */
  fallback?: ReactNode
}
interface State {
  error: Error | null
}

/**
 * 基本容错边界：兜住渲染期抛出的组件错误，显降级 UI 而非整页白屏。
 * 一个坏数据/坏组件只影响被包裹的这块，外层壳（侧栏/顶栏）与其他页面不受影响。
 * 用法：包在内容区/高风险模块外，传 resetKey={location.pathname} 让切页后自动恢复。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // 记录便于排查，不阻断（生产可在此接错误上报）
    console.error('[ErrorBoundary]', error, info)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mg-danger/10 text-mg-danger">
            <LuTriangleAlert size={24} />
          </span>
          <div className="space-y-1">
            <div className="text-base font-bold text-mg-text-1">{i18n.t('common.errorBoundary.title')}</div>
            <p className="text-xs leading-relaxed text-mg-text-3">
              {i18n.t('common.errorBoundary.desc')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="brand" size="sm" onClick={() => this.setState({ error: null })}>
              <LuRotateCw className="mr-1.5 h-4 w-4" />
              {i18n.t('common.retry')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              {i18n.t('common.errorBoundary.refresh')}
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
