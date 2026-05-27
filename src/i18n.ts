import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getInitialLang } from '@/lib/market'

const resources = {
  zh: {
    translation: {
      playground: '体验',
      models: '模型',
      docs: '文档',
      language: '语言切换',
      help: '帮助中心',
      profile: '个人中心',
      orgSettings: '组织管理',
      logout: '退出登录',
      theme: '主题设置',
      themeLight: '明亮模式',
      themeDark: '暗黑模式',
      themeSystem: '系统默认',
      currentOrg: '当前组织',
      currentWorkspace: '当前工作区',
      defaultWorkspace: '默认工作区'
    }
  },
  en: {
    translation: {
      playground: 'Playground',
      models: 'Models',
      docs: 'Docs',
      language: 'Language',
      help: 'Help',
      profile: 'Profile',
      orgSettings: 'Organization',
      logout: 'Sign Out',
      theme: 'Theme',
      themeLight: 'Light Mode',
      themeDark: 'Dark Mode',
      themeSystem: 'System',
      currentOrg: 'Organization',
      currentWorkspace: 'Workspace',
      defaultWorkspace: 'Default Workspace'
    }
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
