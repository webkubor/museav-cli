/**
 * 路由级国际化 namespace 加载器
 * 路由：全局
 * API：无
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { loadLocaleNamespaces, type LocaleNamespace } from '@/i18n'

type LocaleNamespacesProps = {
  namespaces: readonly LocaleNamespace[]
  fallback: ReactNode
  children: ReactNode
}

/**
 * 在页面渲染前加载当前路由需要的语言包，避免短暂显示 i18n key。
 */
export function LocaleNamespaces({ namespaces, fallback, children }: LocaleNamespacesProps) {
  const { i18n } = useTranslation()
  const [readyKey, setReadyKey] = useState('')
  const namespaceKey = namespaces.join(',')
  const targetKey = `${i18n.language}:${namespaceKey}`

  useEffect(() => {
    let cancelled = false
    loadLocaleNamespaces(namespaces, i18n.language)
      .then(() => {
        if (!cancelled) setReadyKey(targetKey)
      })
    return () => {
      cancelled = true
    }
  }, [i18n.language, namespaces, targetKey])

  return readyKey === targetKey ? children : fallback
}
