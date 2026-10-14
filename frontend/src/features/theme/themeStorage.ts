/**
 * Preferência de tema (claro, escuro ou do sistema) e sua aplicação no <html>.
 *
 * A mesma lógica roda antes do React num script inline do index.html (evita o
 * "flash" do tema errado); se mudar a chave ou os valores aqui, mude lá também.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'ai-helpdesk.theme'
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/** Lê a preferência salva; sem acesso ao storage (modo privado, bloqueio) vale "sistema". */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Sem storage a escolha vale só para esta visita.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

/** Avisa quando o SO troca entre claro e escuro. Retorna a função de cancelamento. */
export function onSystemThemeChange(listener: (prefersDark: boolean) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(DARK_QUERY)
  const handler = (event: MediaQueryListEvent) => listener(event.matches)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/** Aplica o tema no <html> sem animar a troca de cores de todos os elementos. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  root.setAttribute('data-theme-switching', '')
  root.dataset.theme = theme
  root.style.colorScheme = theme
  const release = () => root.removeAttribute('data-theme-switching')
  // Dois quadros: o navegador pinta o tema novo antes de reativar as transições.
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(release))
  } else {
    release()
  }
}
