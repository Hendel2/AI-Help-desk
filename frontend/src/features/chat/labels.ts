import type { ConversationStatus } from './types'

/** Situação da conversa em pt-BR (página do assistente e painel flutuante). */
export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  ACTIVE: 'Em andamento',
  RESOLVED: 'Resolvida',
  ESCALATED: 'Virou chamado',
  CLOSED: 'Encerrada',
}
