import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { chatService } from '../services/chat.service'
import type { Conversation } from '../types'

export const chatKeys = {
  all: ['chat'] as const,
  assistant: () => [...chatKeys.all, 'assistant'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  detail: (id: number) => [...chatKeys.all, 'detail', id] as const,
}

/** Se o assistente responde com IA (só muda quando o servidor é reconfigurado). */
export function useAssistantInfo() {
  return useQuery({
    queryKey: chatKeys.assistant(),
    queryFn: ({ signal }) => chatService.assistant(signal),
    staleTime: 5 * 60_000,
  })
}

/** `enabled = false` adia a busca (ex.: o painel flutuante só carrega ao abrir). */
export function useConversations(enabled = true) {
  return useQuery({
    queryKey: chatKeys.list(),
    queryFn: ({ signal }) => chatService.list(signal),
    enabled,
  })
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: chatKeys.detail(id ?? 0),
    queryFn: ({ signal }) => chatService.get(id ?? 0, signal),
    enabled: id !== null,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => chatService.create(),
    onSuccess: (conversation) => {
      queryClient.setQueryData(chatKeys.detail(conversation.id), conversation)
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() })
    },
  })
}

/** Envia a mensagem e acrescenta o par (usuário + assistente) ao histórico em cache. */
export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: number; content: string }) =>
      chatService.send(conversationId, content),
    onSuccess: (turn, { conversationId }) => {
      queryClient.setQueryData<Conversation>(chatKeys.detail(conversationId), (current) =>
        current
          ? {
              ...current,
              title: current.title ?? turn.user_message.content.slice(0, 200),
              messages: [...current.messages, turn.user_message, turn.assistant_message],
            }
          : current,
      )
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() })
    },
  })
}

export function useConversationOutcome(conversationId: number | null) {
  const queryClient = useQueryClient()
  const refresh = () => {
    if (conversationId !== null) {
      void queryClient.invalidateQueries({ queryKey: chatKeys.detail(conversationId) })
    }
    void queryClient.invalidateQueries({ queryKey: chatKeys.list() })
  }
  return {
    escalate: useMutation({
      mutationFn: () => chatService.escalate(conversationId ?? 0),
      onSuccess: () => {
        refresh()
        void queryClient.invalidateQueries({ queryKey: ['tickets'] })
      },
    }),
    resolve: useMutation({
      mutationFn: () => chatService.resolve(conversationId ?? 0),
      onSuccess: refresh,
    }),
  }
}

export function useMessageFeedback() {
  return useMutation({
    mutationFn: ({ messageId, rating }: { messageId: number; rating: 'POSITIVE' | 'NEGATIVE' }) =>
      chatService.feedback(messageId, rating),
  })
}
