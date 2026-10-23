import { createContext, useContext } from 'react'

export type WidgetView = 'home' | 'history' | 'chat'

export interface AssistantWidgetApi {
  isOpen: boolean
  view: WidgetView
  /** Conversa aberta no painel; `null` = a próxima mensagem cria uma nova. */
  conversationId: number | null
  /** Muda a cada conversa escolhida e remonta a sessão (criar a conversa não remonta). */
  sessionKey: number
  /** Primeira mensagem de uma conversa nova (ex.: barra "pergunte" do início). */
  initialMessage: string | null
  open: () => void
  close: () => void
  showHome: () => void
  showHistory: () => void
  openConversation: (id: number) => void
  /** Abre o painel numa conversa nova, opcionalmente já enviando `message`. */
  startConversation: (message?: string) => void
  /** A primeira mensagem criou a conversa: guarda o id sem remontar a sessão. */
  rememberConversation: (id: number) => void
}

export const AssistantWidgetContext = createContext<AssistantWidgetApi | null>(null)

/** Controle do painel flutuante do Assistente de TI (abrir, conversa nova, histórico). */
export function useAssistantWidget(): AssistantWidgetApi {
  const context = useContext(AssistantWidgetContext)
  if (!context) {
    throw new Error('useAssistantWidget precisa estar dentro de <AssistantWidgetProvider>.')
  }
  return context
}
