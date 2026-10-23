import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AssistantWidgetContext } from './assistantWidgetContext'
import type { AssistantWidgetApi, WidgetView } from './assistantWidgetContext'

/** Estado do painel do assistente, compartilhado pela moldura (fica montado entre as rotas). */
export function AssistantWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<WidgetView>('home')
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const [initialMessage, setInitialMessage] = useState<string | null>(null)

  const api = useMemo<AssistantWidgetApi>(
    () => ({
      isOpen,
      view,
      conversationId,
      sessionKey,
      initialMessage,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      showHome: () => setView('home'),
      showHistory: () => setView('history'),
      openConversation: (id) => {
        setConversationId(id)
        setInitialMessage(null)
        setSessionKey((key) => key + 1)
        setView('chat')
      },
      startConversation: (message) => {
        setConversationId(null)
        setInitialMessage(message?.trim() || null)
        setSessionKey((key) => key + 1)
        setView('chat')
        setIsOpen(true)
      },
      rememberConversation: (id) => setConversationId(id),
    }),
    [isOpen, view, conversationId, sessionKey, initialMessage],
  )

  return <AssistantWidgetContext.Provider value={api}>{children}</AssistantWidgetContext.Provider>
}
