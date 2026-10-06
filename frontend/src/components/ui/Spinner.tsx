import { Loader2 } from 'lucide-react'

import { cx } from './styles'

interface SpinnerProps {
  /** Texto para leitores de tela; omita quando o contexto já anuncia o estado. */
  label?: string
  className?: string
}

/** Indicador de carregamento em andamento (único uso de `animate-spin`). */
export function Spinner({ label, className }: SpinnerProps) {
  return (
    <>
      <Loader2
        aria-hidden="true"
        className={cx('size-4 motion-safe:animate-spin', className)}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  )
}
