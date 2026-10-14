import { cx, FOCUS_RING } from './styles'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-text hover:bg-surface-hover',
  danger: 'bg-danger text-on-danger hover:brightness-95',
}

const SIZES: Record<ButtonSize, string> = {
  // Altura mínima de 44px no toque (§53/skill responsive-design) via py + text-sm.
  sm: 'min-h-9 gap-1.5 px-3 py-1.5 text-sm',
  md: 'min-h-11 gap-2 px-4 py-2 text-sm md:min-h-10',
}

/** Classes de botão compartilhadas por `Button` e `ButtonLink` (mesma aparência). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}): string {
  return cx(
    'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    FOCUS_RING,
    className,
  )
}
