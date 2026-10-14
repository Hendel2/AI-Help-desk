import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ThemeContext } from './themeContext'
import {
  applyTheme,
  onSystemThemeChange,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeThemePreference,
} from './themeStorage'
import type { ThemePreference } from './themeStorage'

/** Tema claro, escuro ou do sistema; a escolha fica neste navegador. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference)
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark)

  // Acompanha o SO enquanto a preferência for "sistema" (e também sem ela: é barato).
  useEffect(() => onSystemThemeChange(setPrefersDark), [])

  const theme = resolveTheme(preference, prefersDark)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
