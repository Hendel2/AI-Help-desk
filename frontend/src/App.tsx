import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'

import { ToastProvider } from '@/components/ui/ToastProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { router } from '@/routes/router'
import { queryClient } from '@/services/queryClient'

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
