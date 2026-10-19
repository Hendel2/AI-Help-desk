import { Bot } from 'lucide-react'
import { Link } from 'react-router'

import { cx, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'

import { useAssistantInfo } from '../hooks/useChat'

interface AssistantStatusProps {
  /** Só o ícone (sidebar recolhida); o estado vira dica e texto para leitores de tela. */
  collapsed?: boolean
  onNavigate?: () => void
}

/** Como o Assistente de TI está respondendo agora, com atalho para a conversa. */
export function AssistantStatus({ collapsed = false, onNavigate }: AssistantStatusProps) {
  const info = useAssistantInfo()
  const state = !info.data
    ? null
    : !info.data.ai_enabled
      ? { text: 'Sem IA, modo básico', dot: 'bg-secondary' }
      : info.data.slow_responses
        ? { text: 'IA local, mais lenta', dot: 'bg-warning' }
        : { text: 'IA ativa', dot: 'bg-success' }
  const description = state ? `Assistente de TI: ${state.text}` : 'Assistente de TI'

  return (
    <Link
      to="/assistente"
      onClick={onNavigate}
      aria-label={collapsed ? description : undefined}
      title={collapsed ? description : undefined}
      className={cx(
        'group flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors hover:bg-surface-hover',
        collapsed && 'justify-center',
        FOCUS_RING,
      )}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Bot aria-hidden="true" className="size-5" />
        {state ? (
          <span
            aria-hidden="true"
            className={cx(
              'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface',
              state.dot,
            )}
          />
        ) : null}
      </span>
      {collapsed ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-text">Assistente de TI</span>
          <span className={cx('block truncate text-xs', SECONDARY_ON_TINT)}>
            {state?.text ?? 'Verificando…'}
          </span>
        </span>
      )}
    </Link>
  )
}
