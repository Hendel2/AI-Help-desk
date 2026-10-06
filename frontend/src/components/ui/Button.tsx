import type { ComponentProps, ReactNode } from 'react'

import { buttonClasses } from './buttonStyles'
import type { ButtonSize, ButtonVariant } from './buttonStyles'
import { Spinner } from './Spinner'

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Mostra indicador e desabilita o botão durante uma ação em andamento. */
  isLoading?: boolean
  /** Ícone opcional antes do texto (Lucide, 16px). */
  icon?: ReactNode
  children: ReactNode
}

/**
 * Botão padrão da aplicação. `type="button"` por padrão: em formulários passe
 * `type="submit"` explicitamente.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {isLoading ? <Spinner /> : icon}
      {children}
    </button>
  )
}
