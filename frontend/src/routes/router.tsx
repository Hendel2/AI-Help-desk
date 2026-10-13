import { createBrowserRouter, Outlet } from 'react-router'

import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/Login/LoginPage'
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage'
import { SystemStatusPage } from '@/pages/SystemStatus/SystemStatusPage'

import {
  AuditPage,
  CategoriesPage,
  ChatPage,
  DashboardPage,
  DepartmentsPage,
  KnowledgeArticlePage,
  KnowledgeEditorPage,
  KnowledgePage,
  NewTicketPage,
  ProfilePage,
  ReportsPage,
  SettingsPage,
  SLAPage,
  TicketDetailsPage,
  TicketsPage,
  UsersPage,
} from './lazyPages'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/status', element: <SystemStatusPage /> },
  {
    // Área autenticada: layout fixo (§36) + verificação de sessão.
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'chamados',
        element: (
          <ProtectedRoute roles={['TECHNICIAN', 'ADMIN']}>
            <TicketsPage key="all" scope="all" />
          </ProtectedRoute>
        ),
      },
      { path: 'chamados/meus', element: <TicketsPage key="mine" scope="mine" /> },
      {
        path: 'chamados/nao-atribuidos',
        element: (
          <ProtectedRoute roles={['TECHNICIAN', 'ADMIN']}>
            <TicketsPage key="unassigned" scope="unassigned" />
          </ProtectedRoute>
        ),
      },
      { path: 'chamados/novo', element: <NewTicketPage /> },
      { path: 'chamados/:ticketId', element: <TicketDetailsPage /> },
      { path: 'assistente', element: <ChatPage /> },
      { path: 'base-de-conhecimento', element: <KnowledgePage /> },
      {
        path: 'base-de-conhecimento/novo',
        element: (
          <ProtectedRoute roles={['ADMIN']}>
            <KnowledgeEditorPage key="novo" />
          </ProtectedRoute>
        ),
      },
      { path: 'base-de-conhecimento/:articleId', element: <KnowledgeArticlePage /> },
      {
        path: 'base-de-conhecimento/:articleId/editar',
        element: (
          <ProtectedRoute roles={['ADMIN']}>
            <KnowledgeEditorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'relatorios',
        element: (
          <ProtectedRoute roles={['TECHNICIAN', 'ADMIN']}>
            <ReportsPage />
          </ProtectedRoute>
        ),
      },
      { path: 'perfil', element: <ProfilePage /> },
      {
        path: 'admin',
        element: (
          <ProtectedRoute roles={['ADMIN']}>
            <Outlet />
          </ProtectedRoute>
        ),
        children: [
          { path: 'usuarios', element: <UsersPage /> },
          { path: 'departamentos', element: <DepartmentsPage /> },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'sla', element: <SLAPage /> },
          { path: 'configuracoes', element: <SettingsPage /> },
          { path: 'auditoria', element: <AuditPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
