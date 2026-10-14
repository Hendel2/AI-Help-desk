import { Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { ThemePreference } from './themeStorage'

export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  icon: LucideIcon
}> = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Do sistema', icon: Monitor },
]
