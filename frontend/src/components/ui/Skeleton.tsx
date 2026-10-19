import { cx } from './styles'

interface SkeletonProps {
  /** Classes de tamanho (ex.: `h-4 w-32`). */
  className?: string
}

/** Bloco de carregamento. Use com o formato do conteúdo real, não um retângulo genérico. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx('block rounded-lg bg-surface-hover motion-safe:animate-pulse', className)}
    />
  )
}

interface SkeletonTextProps {
  /** Quantidade de linhas simuladas. */
  lines?: number
  className?: string
}

/**
 * Várias linhas de texto em carregamento, já anunciadas a leitores de tela.
 * Use dentro de uma região com `aria-busy` quando o contexto exigir.
 */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cx('space-y-2', className)} aria-busy="true">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cx('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
