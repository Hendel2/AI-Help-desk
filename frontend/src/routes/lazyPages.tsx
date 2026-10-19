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
export const KnowledgePage = lazy(() =>
  import('@/pages/Knowledge/KnowledgePage').then((module) => ({ default: module.KnowledgePage })),
)
export const KnowledgeArticlePage = lazy(() =>
  import('@/pages/KnowledgeArticle/KnowledgeArticlePage').then((module) => ({
    default: module.KnowledgeArticlePage,
  })),
)
export const KnowledgeEditorPage = lazy(() =>
  import('@/pages/KnowledgeEditor/KnowledgeEditorPage').then((module) => ({
    default: module.KnowledgeEditorPage,
  })),
)
export const NotificationsPage = lazy(() =>
  import('@/pages/Notifications/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
)
export const ChatPage = lazy(() =>
  import('@/pages/Chat/ChatPage').then((module) => ({ default: module.ChatPage })),
)
export const UsersPage = lazy(() =>
  import('@/pages/Admin/UsersPage').then((module) => ({ default: module.UsersPage })),
)
export const DepartmentsPage = lazy(() =>
  import('@/pages/Admin/DepartmentsPage').then((module) => ({ default: module.DepartmentsPage })),
)
export const CategoriesPage = lazy(() =>
  import('@/pages/Admin/CategoriesPage').then((module) => ({ default: module.CategoriesPage })),
)
export const SLAPage = lazy(() =>
  import('@/pages/Admin/SLAPage').then((module) => ({ default: module.SLAPage })),
)
export const SettingsPage = lazy(() =>
  import('@/pages/Admin/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
export const AuditPage = lazy(() =>
  import('@/pages/Admin/AuditPage').then((module) => ({ default: module.AuditPage })),
)
export const ReportsPage = lazy(() =>
  import('@/pages/Reports/ReportsPage').then((module) => ({ default: module.ReportsPage })),
)
