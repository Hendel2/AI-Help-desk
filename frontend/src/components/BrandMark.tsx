import { useId } from 'react'

import { cx } from '@/components/ui/styles'

interface BrandMarkProps {
  /** Mostra o nome ao lado do símbolo. */
  withName?: boolean
  className?: string
}

/**
 * Marca do produto: o canhoto de um chamado (com os recortes laterais) e o
 * visto de resolvido. Cores vêm dos tokens, então acompanham o tema.
 */
export function BrandMark({ withName = true, className }: BrandMarkProps) {
  // `url(#…)` não aceita os caracteres especiais que o useId pode gerar.
  const maskId = `brand-mask-${useId().replace(/[^\w-]/g, '')}`
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 shrink-0">
        {/* Máscara por luminância (branco mantém, preto recorta): não é cor de tema. */}
        <mask id={maskId}>
          <rect width="32" height="32" fill="white" />
          <circle cx="3" cy="16" r="3.25" fill="black" />
          <circle cx="29" cy="16" r="3.25" fill="black" />
        </mask>
        <rect
          x="3"
          y="6"
          width="26"
          height="20"
          rx="4"
          mask={`url(#${maskId})`}
          className="fill-primary"
        />
        <path
          d="M10.5 16.25 14 19.75 21.5 12.25"
          fill="none"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-on-primary"
        />
      </svg>
      {withName ? (
        <span className="text-base font-semibold tracking-tight text-text">AI Help Desk</span>
      ) : null}
    </span>
  )
}
