export const modelGoBrandIcons = {
  onDark: '/brand/modelgo-app-icon-light.svg',
  onLight: '/brand/modelgo-app-icon-dark.svg',
} as const

export const modelGoFaviconLinks = [
  {
    url: modelGoBrandIcons.onLight,
    type: 'image/svg+xml',
    media: '(prefers-color-scheme: light)',
  },
  {
    url: modelGoBrandIcons.onDark,
    type: 'image/svg+xml',
    media: '(prefers-color-scheme: dark)',
  },
] as const
