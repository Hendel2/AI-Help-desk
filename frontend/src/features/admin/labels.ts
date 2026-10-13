import type { AuditAction } from './types'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_CREATED: 'Usuário criado',
  USER_UPDATED: 'Usuário alterado',
  USER_DELETED: 'Usuário desativado',
  TICKET_CREATED: 'Chamado aberto',
  TICKET_UPDATED: 'Chamado alterado',
  TICKET_DELETED: 'Chamado excluído',
  PERMISSION_CHANGED: 'Perfil alterado',
  AI_ACTION_EXECUTED: 'Ação da IA',
  KNOWLEDGE_CREATED: 'Artigo criado',
  KNOWLEDGE_UPDATED: 'Artigo alterado',
  KNOWLEDGE_DELETED: 'Artigo excluído',
  LOGIN_SUCCEEDED: 'Login',
  LOGIN_FAILED: 'Login recusado',
  SETTINGS_CHANGED: 'Configuração alterada',
}

export const ENTITY_LABELS: Record<string, string> = {
  user: 'Usuário',
  ticket: 'Chamado',
  knowledge_article: 'Artigo',
  department: 'Departamento',
  category: 'Categoria',
  sla_policy: 'Política de SLA',
  company: 'Empresa',
}

