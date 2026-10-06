import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cx } from '@/components/ui/styles'

export interface ErrorStateProps {
  /** Mensagem principal (ex.: "Não foi possível carregar os chamados."). */
  title?: string
  /** Detalhe vindo do backend; use `getErrorMessage(error)`. */
  description?: string
  /** Chame `refetch()` da query. Sem ela o botão não é exibido. */
  onRetry?: () => void
  isRetrying?: boolean
  className?: string
}

/** Estado de erro obrigatório (§52). O texto do botão é sempre "Tentar novamente". */
export function ErrorState({
  title = 'Não foi possível carregar os dados.',
  description,
  onRetry,
  isRetrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cx('flex flex-col items-center gap-3 px-4 py-12 text-center', className)}
    >
      <AlertTriangle aria-hidden="true" className="size-6 text-danger" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">{title}</p>
        {description ? <p className="text-sm text-secondary">{description}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} isLoading={isRetrying}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  )
}
