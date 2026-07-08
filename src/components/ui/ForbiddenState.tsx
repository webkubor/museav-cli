import { useNavigate } from 'react-router-dom'
import { LuShieldAlert } from 'react-icons/lu'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

interface ForbiddenStateProps {
  /** 无权访问的资源名，如「安全护栏」「API Keys」；用于文案「无权访问此工作空间的{resource}」 */
  resource?: string
  /** 覆盖默认标题 */
  title?: string
  /** 覆盖默认说明 */
  description?: string
  /** 是否显示「返回总览」按钮（默认显示） */
  showBackHome?: boolean
}

/**
 * 内容区级 403「无权限」兼容态。
 * 用于：接口正常返回但业务码 40301（无权限）——典型是访问了自己无权的工作空间级页面
 * （护栏/API Keys/可观测性）。区别于全屏 ForbiddenPage（那是「不属于任何组织」的无租户态）。
 * 保留侧栏/顶栏，用户可切工作空间或返回总览，不是死胡同。
 */
export function ForbiddenState({ resource, title, description, showBackHome = true }: ForbiddenStateProps) {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={<LuShieldAlert />}
      title={title ?? '无权访问'}
      description={
        description ??
        (resource
          ? `你没有访问此工作空间「${resource}」的权限，请联系管理员开通，或切换到你有权限的工作空间。`
          : '你没有访问此内容的权限，请联系管理员开通，或切换到你有权限的工作空间。')
      }
      action={
        showBackHome ? (
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            返回总览
          </Button>
        ) : undefined
      }
    />
  )
}
