import { SendHorizontal } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useEffect, useRef } from 'react'

import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FIELD_BASE, FOCUS_RING } from '@/components/ui/styles'
import { getErrorMessage } from '@/services/api/errors'

import type { ChatSession } from '../hooks/useChatSession'
import { ChatMessage } from './ChatMessage'

/** Exemplos do estado inicial (§45). */
const EXAMPLES = [
  'Minha internet está lenta',
  'Não consigo acessar o e-mail',
  'Minha VPN não conecta',
  'Preciso abrir um chamado',
]

interface PartProps {
  session: ChatSession
  /** Painel flutuante: espaçamentos menores e exemplos em uma coluna. */
  compact?: boolean
}

/** Histórico com os estados obrigatórios: carregando, erro, início (exemplos) e mensagens. */
export function ChatLog({ session, compact = false, userName }: PartProps & { userName: string }) {
  const { conversation, conversationId, messages, pending } = session
  const logRef = useRef<HTMLDivElement>(null)

  // Mantém a última mensagem visível.
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages.length, pending])

  return (
    <div
      ref={logRef}
      role="log"
      aria-live="polite"
      aria-label="Mensagens"
      className={cx('flex-1 space-y-5 overflow-y-auto', compact ? 'p-3' : 'p-4')}
    >
      {conversationId !== null && conversation.isPending ? (
        <SkeletonText lines={4} />
      ) : conversation.isError ? (
        <ErrorState
          title="Não foi possível carregar a conversa."
          description={getErrorMessage(conversation.error)}
          onRetry={() => void conversation.refetch()}
        />
      ) : messages.length === 0 && pending === null ? (
        <div
          className={cx(
            'mx-auto flex h-full max-w-lg flex-col justify-center gap-5',
            compact ? 'py-4' : 'py-10',
          )}
        >
          <div className="space-y-1">
            <p className="text-lg font-bold tracking-tight text-text">Olá! Como posso ajudar?</p>
            <p className="text-sm text-secondary">
              Descreva o problema com suas palavras ou comece por um destes:
            </p>
          </div>
          <div className={cx('grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void session.submit(example)}
                className={cx(
                  'min-h-11 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm text-text transition-colors hover:border-border-strong hover:bg-surface-hover',
                  FOCUS_RING,
                )}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} userName={userName} />
          ))}
          {pending !== null ? (
            <>
              <ChatMessage
                message={{
                  id: -1,
                  role: 'USER',
                  content: pending,
                  intent: null,
                  sources: null,
                  suggest_ticket: false,
                  created_at: new Date().toISOString(),
                }}
                userName={userName}
              />
              <p className="text-sm text-secondary" aria-busy="true">
                O assistente está escrevendo…
                {session.slowAI ? ' A IA local pode levar até 1 minuto.' : null}
              </p>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

/** "Resolvido" e "Falar com a equipe": desfechos sempre à mão, sem depender da IA. */
export function FinishActions({ session, compact = false }: PartProps) {
  if (!session.canFinish) return null
  return (
    <div className={cx('flex shrink-0 gap-2', compact && 'w-full')}>
      <Button
        size="sm"
        variant="ghost"
        className={compact ? 'flex-1' : undefined}
        isLoading={session.isResolving}
        onClick={() => void session.resolve()}
      >
        Resolvido
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className={compact ? 'flex-1' : undefined}
        isLoading={session.isEscalating}
        onClick={() => void session.escalate()}
      >
        Falar com a equipe
      </Button>
    </div>
  )
}

/** Oferta de chamado quando a IA (ou o modo básico) indica que a equipe precisa assumir. */
export function TicketOffer({ session, inputId }: PartProps & { inputId: string }) {
  if (!session.offerTicket) return null
  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-text">Deseja abrir um chamado com nossa equipe?</p>
      <div className="flex gap-2">
        <Button size="sm" isLoading={session.isEscalating} onClick={() => void session.escalate()}>
          Sim, abrir chamado
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => document.getElementById(inputId)?.focus()}
        >
          Continuar tentando
        </Button>
      </div>
    </div>
  )
}

/** Caixa de mensagem (Enter envia, Shift+Enter quebra a linha) ou aviso de conversa encerrada. */
export function ChatComposer({
  session,
  inputId,
  closedHint,
}: PartProps & { inputId: string; closedHint: string }) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void session.submit(session.draft)
    }
  }

  if (!session.isActive) {
    return <p className="border-t border-border px-4 py-3 text-sm text-secondary">{closedHint}</p>
  }
  return (
    <form
      className="flex items-end gap-2 border-t border-border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void session.submit(session.draft)
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Mensagem para o Assistente de TI
      </label>
      <textarea
        id={inputId}
        rows={1}
        value={session.draft}
        maxLength={4000}
        placeholder="Digite sua mensagem…"
        onChange={(event) => session.setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        className={cx(FIELD_BASE, 'max-h-40 min-h-11 resize-none')}
      />
      <Button
        type="submit"
        aria-label="Enviar mensagem"
        disabled={!session.draft.trim() || session.pending !== null}
        icon={<SendHorizontal aria-hidden="true" className="size-4" />}
      >
        <span className="sr-only sm:not-sr-only">Enviar</span>
      </Button>
    </form>
  )
}
