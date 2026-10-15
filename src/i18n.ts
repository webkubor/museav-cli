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
import zhBilling from './locales/zh/billing.json'
import enCommon from './locales/en/common.json'
import enHeader from './locales/en/header.json'
import enNav from './locales/en/nav.json'
import enOnboarding from './locales/en/onboarding.json'
import enPromo from './locales/en/promo.json'
import enSidebarSettings from './locales/en/sidebarSettings.json'
import enBilling from './locales/en/billing.json'

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
// billing 进核心包（prd46#1215 bug：充值弹框慢/要点两下）：全局充值弹窗 TopUpModal 常驻
// DashboardLayout，此前靠 LocaleNamespaces 异步门控挂载——ns 加载完成前组件不在树上，
// 用户点「充值」openRecharge() 置了 zustand 却无订阅者，零反馈直到语言包加载完弹窗才
// 「突然」出现（弱网数百 ms），被当成「没点上」再点一次。静态进核心包后随首屏 bundle
// 一起就位，弹窗挂载不再有窗口期。体积代价：billing.json 中英各 ~4KB gz，可接受。
const coreLocaleNamespaces = ['common', 'header', 'nav', 'onboarding', 'promo', 'sidebarSettings', 'billing'] satisfies LocaleNamespace[]

const resources = {
  zh: {
    common: zhCommon,
    header: zhHeader,
    nav: zhNav,
    onboarding: zhOnboarding,
    promo: zhPromo,
    sidebarSettings: zhSidebarSettings,
    billing: zhBilling,
  },
  en: {
    common: enCommon,
    header: enHeader,
    nav: enNav,
    onboarding: enOnboarding,
    promo: enPromo,
    sidebarSettings: enSidebarSettings,
    billing: enBilling,
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
