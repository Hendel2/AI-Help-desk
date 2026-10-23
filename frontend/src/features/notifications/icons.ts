import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Ticket,
  UserCheck,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { NotificationType } from './types'

/** Ícone e cor por tipo: violeta para eventos, cor de estado só para prazo e resolução. */
export const NOTIFICATION_ICONS: Record<NotificationType, { icon: LucideIcon; className: string }> =
  {
    TICKET_CREATED: { icon: Ticket, className: 'bg-primary-soft text-primary' },
    TICKET_ASSIGNED: { icon: UserCheck, className: 'bg-primary-soft text-primary' },
    COMMENT_ADDED: { icon: MessageSquare, className: 'bg-primary-soft text-primary' },
    TICKET_RESOLVED: { icon: CheckCircle2, className: 'bg-success-soft text-success' },
    SLA_WARNING: { icon: AlertTriangle, className: 'bg-warning-soft text-warning' },
    SLA_BREACHED: { icon: XCircle, className: 'bg-danger-soft text-danger' },
  }
