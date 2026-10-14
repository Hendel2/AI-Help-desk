import { afterEach, describe, expect, it } from 'vitest'

import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from './themeStorage'

afterEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('preferência de tema', () => {
  it('usa o tema do sistema quando nada foi escolhido ou o valor é inválido', () => {
    expect(readThemePreference()).toBe('system')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'roxo')
    expect(readThemePreference()).toBe('system')
  })

  it('guarda claro/escuro e esquece a chave ao voltar para "sistema"', () => {
    writeThemePreference('dark')
    expect(readThemePreference()).toBe('dark')
    writeThemePreference('system')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('resolve "sistema" pela preferência do SO', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('aplica o tema no <html> com color-scheme correspondente', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
