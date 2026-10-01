export const THEMES = [
  {
    id: 'signal',
    label: 'Signal',
    description: 'SignalDesk control-room theme: ink-blue surfaces with a teal signal color.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'signal'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'signal'
}

export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
