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

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLang(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
