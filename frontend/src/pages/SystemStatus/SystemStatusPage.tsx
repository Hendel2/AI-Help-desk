import { CircleCheck, TriangleAlert } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { useHealth } from '@/hooks/useHealth'
import { getErrorMessage } from '@/services/api/errors'
import type { HealthResponse } from '@/types/health'

/**
 * Página pública de diagnóstico (/status): valida o fluxo completo
 * Component -> Hook -> TanStack Query -> Service -> API.
 */
export function SystemStatusPage() {
  const { data, error, isPending, isError, isFetching, refetch } = useHealth()
  const isRetrying = isError && isFetching

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-2xl font-semibold tracking-tight text-text">AI Help Desk</h1>
      <p className="mt-2 text-secondary">
        Plataforma de Help Desk de TI multiempresa, com inteligência artificial para apoiar o
        atendimento.
      </p>

      <Card title="Status da API" className="mt-10">
        <div role="status" aria-live="polite" aria-busy={isPending || isRetrying}>
          {isPending || isRetrying ? (
            <HealthSkeleton />
          ) : isError ? (
            <ErrorState
              title="Não foi possível verificar o status da API."
              description={getErrorMessage(error)}
              onRetry={() => {
                void refetch()
              }}
              className="py-4"
            />
          ) : (
            <HealthDetails health={data} />
          )}
        </div>
      </Card>
    </main>
  )
}

function HealthSkeleton() {
  return (
    <>
      <span className="sr-only">Verificando o status da API…</span>
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    </>
  )
}

const DATABASE_LABELS: Record<HealthResponse['database'], string> = {
  ok: 'Disponível',
  unavailable: 'Indisponível',
}

function HealthDetails({ health }: { health: HealthResponse }) {
  return (
    <div>
      {health.status === 'ok' ? (
        <p className="flex items-center gap-3 font-medium text-text">
          <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" />
          API operacional
        </p>
      ) : (
        <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-soft p-3">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-text">API com funcionamento degradado</p>
            <p className="mt-1 text-sm text-secondary">
              A API está respondendo, mas alguns recursos podem não funcionar corretamente.
            </p>
          </div>
        </div>
      )}

      <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-secondary">Banco de dados</dt>
          <dd className="mt-1 text-sm font-medium text-text">{DATABASE_LABELS[health.database]}</dd>
        </div>
        <div>
          <dt className="text-sm text-secondary">Versão</dt>
          <dd className="mt-1 font-mono text-sm text-text">{health.version}</dd>
        </div>
      </dl>
    </div>
  )
}
