import { createContext } from 'react'

export interface MenuContextValue {
  /** Fecha o menu e devolve o foco ao botão que o abriu. */
  close: () => void
}

export const MenuContext = createContext<MenuContextValue | null>(null)
