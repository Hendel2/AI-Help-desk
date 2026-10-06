import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { RouteObject } from 'react-router'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { ToastProvider } from '@/components/ui/ToastProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

interface RenderWithProvidersOptions {
  /** Rota inicial do roteador em memória. */
  route?: string
  /** Rotas completas; por padrão `ui` é renderizado em qualquer rota. */
  routes?: RouteObject[]
  queryClient?: QueryClient
  /** Envolve a árvore no `AuthProvider` (necessário para telas autenticadas). */
  withAuth?: boolean
}

/** Renderiza com um QueryClient novo (sem retry) e um roteador em memória. */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    routes,
    queryClient = createTestQueryClient(),
    withAuth = false,
  }: RenderWithProvidersOptions = {},
) {
  const router = createMemoryRouter(routes ?? [{ path: '*', element: ui }], {
    initialEntries: [route],
  })
  const tree = <RouterProvider router={router} />

  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{withAuth ? <AuthProvider>{tree}</AuthProvider> : tree}</ToastProvider>
      </QueryClientProvider>,
    ),
  }
}
