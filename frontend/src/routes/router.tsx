import { createBrowserRouter } from 'react-router'

import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/Login/LoginPage'
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage'
import { SystemStatusPage } from '@/pages/SystemStatus/SystemStatusPage'

import {
  DashboardPage,
  NewTicketPage,
  ProfilePage,
  TicketDetailsPage,
  TicketsPage,
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
      { path: 'perfil', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
