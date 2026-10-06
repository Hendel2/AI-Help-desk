import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { LinkProps } from 'react-router'

import { buttonClasses } from './buttonStyles'
import type { ButtonSize, ButtonVariant } from './buttonStyles'

export interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Navegação com aparência de botão (ex.: "+ Novo chamado"). Continua sendo um
 * link de verdade: abre em nova aba, aparece no histórico e é anunciado como link.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
