import React from 'react'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import { SiWechat } from 'react-icons/si'

export const OAUTH_ICONS: Record<string, React.ReactNode> = {
  wechat: <SiWechat size={17} style={{ color: '#07C160', flexShrink: 0 }} />,
  github: <Github size={17} style={{ flexShrink: 0 }} />,
  google: <Google.Color size={17} style={{ flexShrink: 0 }} />,
}

export const OAUTH_ICONS_LG: Record<string, React.ReactNode> = {
  wechat: <SiWechat size={20} style={{ color: '#07C160', flexShrink: 0 }} />,
  github: <Github size={20} style={{ flexShrink: 0 }} />,
  google: <Google.Color size={20} style={{ flexShrink: 0 }} />,
}

export const OAUTH_LABELS: Record<string, string> = {
  wechat: '微信',
  github: 'GitHub',
  google: 'Google',
}
