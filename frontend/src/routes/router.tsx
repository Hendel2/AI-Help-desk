import { Navigate, createBrowserRouter } from 'react-router'

import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/Login/LoginPage'
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage'
import { ProfilePage } from '@/pages/Profile/ProfilePage'
import { SystemStatusPage } from '@/pages/SystemStatus/SystemStatusPage'

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
      // O dashboard chega na etapa 07 do roadmap; até lá a home é o perfil.
      { index: true, element: <Navigate to="/perfil" replace /> },
      { path: 'perfil', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
