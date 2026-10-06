import { getInitials } from './initials'
import { cx } from './styles'

export interface AvatarProps {
  name: string
  /** URL da imagem; sem ela são exibidas as iniciais. */
  src?: string | null
  size?: 'sm' | 'md'
  className?: string
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
} as const

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const classes = cx(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    SIZES[size],
    className,
  )

  if (src) {
    // O nome aparece ao lado do avatar na interface: a imagem é decorativa.
    return <img src={src} alt="" className={cx(classes, 'object-cover')} />
  }

  return (
    <span aria-hidden="true" className={cx(classes, 'bg-primary-soft font-semibold text-primary')}>
      {getInitials(name)}
    </span>
  )
}
