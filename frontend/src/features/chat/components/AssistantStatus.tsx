import { cx, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { AssistantAvatar } from '@/components/AssistantAvatar'

import { useAssistantState } from '../hooks/useAssistantState'
import { useAssistantWidget } from '../widget/assistantWidgetContext'

interface AssistantStatusProps {
  /** Só o ícone (sidebar recolhida); o estado vira dica e texto para leitores de tela. */
  collapsed?: boolean
  onNavigate?: () => void
}

/** Como o Assistente de TI está respondendo agora; um clique abre o painel flutuante. */
export function AssistantStatus({ collapsed = false, onNavigate }: AssistantStatusProps) {
  const widget = useAssistantWidget()
  const state = useAssistantState()
  const description = `Abrir o Assistente de TI${state ? ` (${state.label})` : ''}`

  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.()
        widget.open()
      }}
      aria-label={collapsed ? description : undefined}
      title={collapsed ? description : undefined}
      className={cx(
        'group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-hover',
        collapsed && 'justify-center',
        FOCUS_RING,
      )}
    >
      <span className="relative shrink-0">
        <AssistantAvatar className="size-8" />
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
            {state?.label ?? 'Verificando…'}
          </span>
        </span>
      )}
    </button>
  )
}
