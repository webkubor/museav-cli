/**
 * 国际化初始化与文档语言同步
 * 路由：全局
 * API：无
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getInitialLang } from '@/lib/market'
import zhCommon from './locales/zh/common.json'
import zhHeader from './locales/zh/header.json'
import zhNav from './locales/zh/nav.json'
import zhOnboarding from './locales/zh/onboarding.json'
import zhPromo from './locales/zh/promo.json'
import zhSidebarSettings from './locales/zh/sidebarSettings.json'
import enCommon from './locales/en/common.json'
import enHeader from './locales/en/header.json'
import enNav from './locales/en/nav.json'
import enOnboarding from './locales/en/onboarding.json'
import enPromo from './locales/en/promo.json'
import enSidebarSettings from './locales/en/sidebarSettings.json'

export const localeNamespaces = [
  'account',
  'apiKeys',
  'billing',
  'chatTest',
  'common',
  'dashboard',
  'dashboardTop',
  'device',
  'enterprise',
  'guardrails',
  'guideSection',
  'header',
  'invitations',
  'logs',
  'models',
  'modelsCatalog',
  'modelsChat',
  'modelsCompare',
  'modelsDiscovery',
  'modelsExperience',
  'modelsHistory',
  'nav',
  'observability',
  'onboarding',
  'platformConfig',
  'promo',
  'quickAccess',
  'sidebarSettings',
  'tasks',
  'terminalSection',
  'usage',
  'welcomeBanner',
  'workspaces',
] as const

export type LocaleNamespace = typeof localeNamespaces[number]

// onboarding 进核心包：新手指南入口常驻侧栏底部，懒加载会先闪一帧 i18n key
const coreLocaleNamespaces = ['common', 'header', 'nav', 'onboarding', 'promo', 'sidebarSettings'] satisfies LocaleNamespace[]

const resources = {
  zh: {
    common: zhCommon,
    header: zhHeader,
    nav: zhNav,
    onboarding: zhOnboarding,
    promo: zhPromo,
    sidebarSettings: zhSidebarSettings,
  },
  en: {
    common: enCommon,
    header: enHeader,
    nav: enNav,
    onboarding: enOnboarding,
    promo: enPromo,
    sidebarSettings: enSidebarSettings,
  }
}

const namespaceLoaders = import.meta.glob('./locales/*/*.json', { import: 'default' })

function documentLanguage(language: string) {
  return language.startsWith('zh') ? 'zh-CN' : 'en'
}

function syncDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = documentLanguage(language)
}

const initialLanguage = getInitialLang()
syncDocumentLanguage(initialLanguage)
i18n.on('languageChanged', syncDocumentLanguage)

i18n
  .use(initReactI18next)
  .init({
    resources,
    ns: coreLocaleNamespaces,
    defaultNS: localeNamespaces,
    fallbackNS: coreLocaleNamespaces,
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

function normalizedLanguage(language: string) {
  return language.startsWith('zh') ? 'zh' : 'en'
}

export function hasLocaleNamespace(language: string, namespace: LocaleNamespace) {
  return i18n.hasResourceBundle(normalizedLanguage(language), namespace)
}

export async function loadLocaleNamespaces(namespaces: readonly LocaleNamespace[], language = i18n.language) {
  const lang = normalizedLanguage(language)
  await Promise.all(namespaces.map(async (namespace) => {
    if (i18n.hasResourceBundle(lang, namespace)) return
    const loader = namespaceLoaders[`./locales/${lang}/${namespace}.json`]
    if (!loader) throw new Error(`[i18n] 缺少语言包：${lang}/${namespace}.json`)
    const resource = await loader()
    i18n.addResourceBundle(lang, namespace, resource, true, true)
  }))
}

export default i18n
