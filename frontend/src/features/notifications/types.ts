/** Contratos de notificações — espelham `backend/app/schemas/notification.py`. */

export type NotificationType =
  | 'TICKET_CREATED'
  | 'TICKET_ASSIGNED'
  | 'COMMENT_ADDED'
  | 'TICKET_RESOLVED'
  | 'SLA_WARNING'
  | 'SLA_BREACHED'

export interface AppNotification {
  id: number
  type: NotificationType
  title: string
  message: string
  ticket_id: number | null
  is_read: boolean
  read_at: string | null
  created_at: string
}
