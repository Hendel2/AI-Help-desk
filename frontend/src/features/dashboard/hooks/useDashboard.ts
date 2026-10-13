import { useQuery } from '@tanstack/react-query'

import { dashboardService } from '../services/dashboard.service'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: (days: number) => [...dashboardKeys.all, 'metrics', days] as const,
  tickets: (days: number) => [...dashboardKeys.all, 'tickets', days] as const,
  sla: (weeks: number) => [...dashboardKeys.all, 'sla', weeks] as const,
  ai: (days: number) => [...dashboardKeys.all, 'ai', days] as const,
}

export function useDashboardMetrics(days: number) {
  return useQuery({
    queryKey: dashboardKeys.metrics(days),
    queryFn: ({ signal }) => dashboardService.metrics(days, signal),
  })
}

export function useDashboardTickets(days: number) {
  return useQuery({
    queryKey: dashboardKeys.tickets(days),
    queryFn: ({ signal }) => dashboardService.tickets(days, signal),
  })
}

export function useDashboardSLA(weeks: number, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.sla(weeks),
    queryFn: ({ signal }) => dashboardService.sla(weeks, signal),
    enabled,
  })
}

/** Uso da IA e AI Insights (somente equipe). */
export function useDashboardAI(days: number, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.ai(days),
    queryFn: ({ signal }) => dashboardService.ai(days, signal),
    enabled,
  })
}
