import { Bot } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { cx, FOCUS_RING } from '@/components/ui/styles'

/** Atalho flutuante para o Assistente de TI em qualquer tela (menos no próprio chat). */
export function AssistantLauncher() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/assistente')) return null

  return (
    // Dentro de uma região de navegação: leitores de tela acham o atalho pelos landmarks.
    <nav aria-label="Atalho para o assistente">
      <Link
        to="/assistente"
        aria-label="Abrir o Assistente de TI"
        title="Assistente de TI"
        className={cx(
          'fixed right-4 bottom-4 z-20 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-overlay transition-colors hover:bg-primary-hover sm:right-6 sm:bottom-6',
          FOCUS_RING,
        )}
      >
        <Bot aria-hidden="true" className="size-6" />
      </Link>
    </nav>
  )
}
