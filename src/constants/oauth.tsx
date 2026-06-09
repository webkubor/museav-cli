import React from 'react'
import Google from '@lobehub/icons/es/Google'
import Github from '@lobehub/icons/es/Github'
import { WechatIcon } from './brand-icons'

export const OAUTH_ICONS: Record<string, React.ReactNode> = {
  wechat: <WechatIcon size={17} />,
  github: <Github size={17} style={{ flexShrink: 0 }} />,
  google: <Google.Color size={17} style={{ flexShrink: 0 }} />,
}

export const OAUTH_ICONS_LG: Record<string, React.ReactNode> = {
  wechat: <WechatIcon size={20} />,
  github: <Github size={20} style={{ flexShrink: 0 }} />,
  google: <Google.Color size={20} style={{ flexShrink: 0 }} />,
}

export const OAUTH_LABELS: Record<string, string> = {
  wechat: '微信',
  github: 'GitHub',
  google: 'Google',
}
