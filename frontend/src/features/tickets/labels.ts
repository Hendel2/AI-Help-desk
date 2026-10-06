import type { BadgeTone } from '@/components/ui/Badge'

import type {
  SLAStatus,
  TicketHistoryAction,
  TicketPriority,
  TicketSource,
  TicketStatus,
} from './types'

/**
 * Rótulos pt-BR únicos dos enums de chamado (skill frontend-design: nunca
 * exibir o valor cru como `IN_PROGRESS`).
 */

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Aberto',
  TRIAGE: 'Em triagem',
  ASSIGNED: 'Atribuído',
  IN_PROGRESS: 'Em andamento',
  WAITING_USER: 'Aguardando usuário',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
  CANCELLED: 'Cancelado',
}

export const STATUS_TONES: Record<TicketStatus, BadgeTone> = {
  OPEN: 'info',
  TRIAGE: 'info',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  WAITING_USER: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
}

/** Rótulo da AÇÃO que leva o chamado a cada status (botões de ação do detalhe). */
export const STATUS_ACTION_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Reabrir',
  TRIAGE: 'Enviar para triagem',
  ASSIGNED: 'Marcar como atribuído',
  IN_PROGRESS: 'Iniciar atendimento',
  WAITING_USER: 'Aguardar usuário',
  RESOLVED: 'Resolver',
  CLOSED: 'Fechar chamado',
  CANCELLED: 'Cancelar chamado',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
}

export const PRIORITY_TONES: Record<TicketPriority, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
}

export const SOURCE_LABELS: Record<TicketSource, string> = {
  WEB: 'Portal',
  CHATBOT: 'Assistente de TI',
  EMAIL: 'E-mail',
  API: 'API',
}

export const SLA_LABELS: Record<SLAStatus, string> = {
  ON_TIME: 'No prazo',
  WARNING: 'Próximo do vencimento',
  BREACHED: 'Vencido',
}

export const SLA_TONES: Record<SLAStatus, BadgeTone> = {
  ON_TIME: 'success',
  WARNING: 'warning',
  BREACHED: 'danger',
}

export const HISTORY_LABELS: Record<TicketHistoryAction, string> = {
  CREATED: 'abriu o chamado',
  STATUS_CHANGED: 'alterou o status',
  PRIORITY_CHANGED: 'alterou a prioridade',
  ASSIGNED: 'atribuiu o chamado',
  CATEGORY_CHANGED: 'alterou a categoria',
  COMMENTED: 'comentou',
  RESOLVED: 'resolveu o chamado',
  CLOSED: 'fechou o chamado',
  REOPENED: 'reabriu o chamado',
  CANCELLED: 'cancelou o chamado',
}

/** Traduz valores do histórico (`old_value`/`new_value`) quando são enums conhecidos. */
export function formatHistoryValue(field: string | null, value: string | null): string | null {
  if (value === null) return null
  if (field === 'status' && value in STATUS_LABELS) return STATUS_LABELS[value as TicketStatus]
  if (field === 'priority' && value in PRIORITY_LABELS) {
    return PRIORITY_LABELS[value as TicketPriority]
  }
  return value
}
