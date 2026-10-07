import { lazy } from 'react'

// Telas da área autenticada carregadas sob demanda (um chunk por tela).
export const TicketsPage = lazy(() =>
  import('@/pages/Tickets/TicketsPage').then((module) => ({ default: module.TicketsPage })),
)
export const TicketDetailsPage = lazy(() =>
  import('@/pages/TicketDetails/TicketDetailsPage').then((module) => ({
    default: module.TicketDetailsPage,
  })),
)
export const NewTicketPage = lazy(() =>
  import('@/pages/NewTicket/NewTicketPage').then((module) => ({ default: module.NewTicketPage })),
)
export const ProfilePage = lazy(() =>
  import('@/pages/Profile/ProfilePage').then((module) => ({ default: module.ProfilePage })),
)
export const DashboardPage = lazy(() =>
  import('@/pages/Dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
