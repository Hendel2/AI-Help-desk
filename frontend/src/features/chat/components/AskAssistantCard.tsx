import { ArrowUp } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { AssistantAvatar } from '@/components/AssistantAvatar'
import { cx, FOCUS_RING } from '@/components/ui/styles'

import { useAssistantState } from '../hooks/useAssistantState'
import { useAssistantWidget } from '../widget/assistantWidgetContext'

/**
 * Atalho do início para o Assistente de TI: a pergunta digitada aqui abre o
 * painel flutuante já com a conversa começada. Vazio, abre o painel.
 */
export function AskAssistantCard({ className }: { className?: string }) {
  const widget = useAssistantWidget()
  const state = useAssistantState()
  const [text, setText] = useState('')
  const titleId = useId()
  const inputId = useId()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const message = text.trim()
    if (message) {
      widget.startConversation(message)
      setText('')
    } else {
      widget.open()
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        'relative flex flex-col gap-5 overflow-hidden rounded-2xl bg-primary p-6 text-on-primary shadow-card',
        className,
      )}
    >
      {/* Recortes de canhoto nas laterais: a mesma assinatura dos indicadores. */}
      <span
        aria-hidden="true"
        className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background"
      />
      <span
        aria-hidden="true"
        className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background"
      />

      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-on-primary/15">
          <AssistantAvatar framed={false} className="size-9" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            Assistente de TI
          </h2>
          <p className="flex items-center gap-1.5 text-sm">
            {state ? (
              <>
                <span aria-hidden="true" className={cx('size-2 rounded-full', state.dot)} />
                {state.detail}
              </>
            ) : (
              'Verificando…'
            )}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-semibold">
          Qual é o problema?
        </label>
        <div className="flex gap-2 rounded-xl bg-surface p-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-on-primary">
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ex.: a VPN não conecta"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-text placeholder:text-secondary focus-visible:outline-none"
          />
          <button
            type="submit"
            aria-label="Perguntar ao assistente"
            className={cx(
              'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-hover',
              FOCUS_RING,
            )}
          >
            <ArrowUp aria-hidden="true" className="size-5" />
          </button>
        </div>
      </form>
      <p className="text-sm">Resolve na hora ou abre o chamado para você. Nunca informe senhas.</p>
    </section>
  )
}
