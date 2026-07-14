/**
 * 国际化初始化与文档语言同步
 * 路由：全局
 * API：无
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getInitialLang } from '@/lib/market'
import zh from './locales/zh.json'
import en from './locales/en.json'

const resources = {
  zh: {
    translation: zh
  },
  en: {
    translation: en
  }
}

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
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
