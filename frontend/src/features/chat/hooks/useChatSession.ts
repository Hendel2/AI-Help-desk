import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useToast } from '@/components/ui/useToast'
import { getErrorMessage } from '@/services/api/errors'

import {
  useAssistantInfo,
  useConversation,
  useConversationOutcome,
  useCreateConversation,
  useSendMessage,
} from './useChat'

interface ChatSessionOptions {
  /** Conversa aberta; `null` = a próxima mensagem cria uma nova. */
  conversationId: number | null
  /** A primeira mensagem criou a conversa: quem exibe guarda o id (URL ou estado). */
  onConversationCreated: (id: number) => void
  /** Depois de abrir o chamado (o padrão já navega até ele). */
  onEscalated?: (ticketId: number) => void
}

/**
 * Estado e ações de uma conversa com o Assistente de TI — compartilhado pela
 * página `/assistente` e pelo painel flutuante, que só mudam a moldura.
 */
export function useChatSession({
  conversationId,
  onConversationCreated,
  onEscalated,
}: ChatSessionOptions) {
  const conversation = useConversation(conversationId)
  const assistant = useAssistantInfo()
  const create = useCreateConversation()
  const send = useSendMessage()
  const outcome = useConversationOutcome(conversationId)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  const messages = conversation.data?.messages ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'ASSISTANT')
  const isActive = !conversation.data || conversation.data.status === 'ACTIVE'
  const offerTicket = isActive && lastAssistant?.suggest_ticket === true && pending === null
  // Depois da primeira resposta, dá para encerrar ou falar com a equipe a qualquer momento.
  const canFinish =
    conversationId !== null && isActive && lastAssistant !== undefined && pending === null

  const submit = async (text: string) => {
    const content = text.trim()
    if (!content || send.isPending) return
    setDraft('')
    setPending(content)
    try {
      let id = conversationId
      if (id === null) {
        const created = await create.mutateAsync()
        id = created.id
        onConversationCreated(id)
      }
      await send.mutateAsync({ conversationId: id, content })
    } catch (error) {
      setDraft(content)
      showToast(getErrorMessage(error, 'Não foi possível enviar a mensagem.'), 'error')
    } finally {
      setPending(null)
    }
  }

  const resolve = async () => {
    try {
      await outcome.resolve.mutateAsync()
      showToast('Que bom que resolveu! A conversa foi encerrada.')
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível encerrar a conversa.'), 'error')
    }
  }

  const escalate = async () => {
    try {
      const result = await outcome.escalate.mutateAsync()
      showToast(`Chamado ${result.ticket_number} aberto. A equipe vai responder por lá.`)
      onEscalated?.(result.ticket_id)
      void navigate(`/chamados/${result.ticket_id}`)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível abrir o chamado.'), 'error')
    }
  }

  return {
    conversationId,
    conversation,
    messages,
    pending,
    draft,
    setDraft,
    submit,
    resolve,
    escalate,
    isResolving: outcome.resolve.isPending,
    isEscalating: outcome.escalate.isPending,
    offerTicket,
    canFinish,
    isActive,
    // Enquanto não se sabe (carregando/erro), vale o padrão: nada de alarme falso.
    basicMode: assistant.data?.ai_enabled === false,
    slowAI: assistant.data?.slow_responses === true,
  }
}

export type ChatSession = ReturnType<typeof useChatSession>
