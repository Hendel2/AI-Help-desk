import { get } from '@/services/api/client'

import type { DashboardMetrics, DashboardSLA, DashboardTickets } from '../types'

/** Chamadas HTTP do dashboard. */

export const dashboardService = {
  metrics: (days: number, signal?: AbortSignal) =>
    get<DashboardMetrics>(`/dashboard/metrics?days=${days}`, { signal }),
  tickets: (days: number, signal?: AbortSignal) =>
    get<DashboardTickets>(`/dashboard/tickets?days=${days}`, { signal }),
  sla: (weeks: number, signal?: AbortSignal) =>
    get<DashboardSLA>(`/dashboard/sla?weeks=${weeks}`, { signal }),
}
