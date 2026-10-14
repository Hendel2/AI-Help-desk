import { createContext } from 'react'

import type { ResolvedTheme, ThemePreference } from './themeStorage'

export interface ThemeContextValue {
  /** O que a pessoa escolheu. */
  preference: ThemePreference
  /** O tema em uso de fato (a preferência "sistema" resolvida). */
  theme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
