import { MessageSquarePlus, SendHorizontal } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FIELD_BASE, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { useToast } from '@/components/ui/useToast'
import { useAuth } from '@/features/auth/useAuth'
import { ChatMessage } from '@/features/chat/components/ChatMessage'
import {
  useConversation,
  useConversationOutcome,
  useConversations,
  useCreateConversation,
  useSendMessage,
} from '@/features/chat/hooks/useChat'
import { getErrorMessage } from '@/services/api/errors'
import { formatRelative } from '@/utils/format'

/** Exemplos do estado inicial (§45). */
const EXAMPLES = [
  'Minha internet está lenta',
  'Não consigo acessar o e-mail',
  'Minha VPN não conecta',
  'Preciso abrir um chamado',
]

const STATUS_LABELS = {
  ACTIVE: 'Em andamento',
  RESOLVED: 'Resolvida',
  ESCALATED: 'Virou chamado',
  CLOSED: 'Encerrada',
} as const

/** Assistente de TI (§45, §46). A conversa ativa fica na URL (?conversa=ID). */
export function ChatPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const conversationId = Number(searchParams.get('conversa')) || null
  const conversations = useConversations()
  const conversation = useConversation(conversationId)
  const create = useCreateConversation()
  const send = useSendMessage()
  const outcome = useConversationOutcome(conversationId)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const messages = conversation.data?.messages ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'ASSISTANT')
  const isActive = !conversation.data || conversation.data.status === 'ACTIVE'
  const offerTicket = isActive && lastAssistant?.suggest_ticket === true && pending === null

  // Mantém a última mensagem visível.
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages.length, pending])

  const submit = async (text: string) => {
    const content = text.trim()
    if (!content || send.isPending) return
    setDraft('')
    setPending(content)
    try {
      let id = conversationId
      if (id === null) {
        const created = await create.mutateAsync()
        id = created.id
        setSearchParams({ conversa: String(id) })
      }
      await send.mutateAsync({ conversationId: id, content })
    } catch (error) {
      setDraft(content)
      showToast(getErrorMessage(error, 'Não foi possível enviar a mensagem.'), 'error')
    } finally {
      setPending(null)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit(draft)
    }
  }

  const escalate = async () => {
    try {
      const result = await outcome.escalate.mutateAsync()
      showToast(`Chamado ${result.ticket_number} aberto. A equipe vai responder por lá.`)
      void navigate(`/chamados/${result.ticket_id}`)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível abrir o chamado.'), 'error')
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[16rem_1fr]">
      <aside aria-label="Conversas anteriores" className="space-y-3">
        <Button
          variant="secondary"
          className="w-full"
          icon={<MessageSquarePlus aria-hidden="true" className="size-4" />}
          onClick={() => setSearchParams({})}
        >
          Nova conversa
        </Button>
        {conversations.data && conversations.data.length > 0 ? (
          <ul className="hidden space-y-1 lg:block">
            {conversations.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === conversationId ? 'true' : undefined}
                  onClick={() => setSearchParams({ conversa: String(item.id) })}
                  className={cx(
                    'group w-full rounded-md px-3 py-2 text-left transition-colors',
                    item.id === conversationId ? 'bg-primary-soft' : 'hover:bg-surface-hover',
                    FOCUS_RING,
                  )}
                >
                  <span className="block truncate text-sm text-text">
                    {item.title ?? 'Nova conversa'}
                  </span>
                  <span
                    className={cx(
                      'block text-xs',
                      // Sobre Primary Soft o Secondary não atinge 4,5:1.
                      item.id === conversationId ? 'text-text' : SECONDARY_ON_TINT,
                    )}
                  >
                    {STATUS_LABELS[item.status]} · {formatRelative(item.updated_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>

      <section
        aria-label="Assistente de TI"
        // Altura fixa: só as mensagens rolam, a caixa de digitação fica sempre visível.
        className="flex h-[calc(100dvh-9rem)] min-h-96 flex-col rounded-lg border border-border bg-surface lg:h-[calc(100dvh-11rem)]"
      >
        <header className="border-b border-border px-4 py-3">
          <h1 className="text-lg font-semibold text-text">Assistente de TI</h1>
          <p className="text-xs text-secondary">
            Respostas baseadas na base de conhecimento da empresa. Nunca informe senhas.
          </p>
        </header>

        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Mensagens"
          className="flex-1 space-y-5 overflow-y-auto p-4"
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
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
              <p className="text-lg font-medium text-text">Olá! Como posso ajudar?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void submit(example)}
                    className={cx(
                      'rounded-full border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-hover',
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
                <ChatMessage key={message.id} message={message} userName={user?.name ?? 'Você'} />
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
                    userName={user?.name ?? 'Você'}
                  />
                  <p className="text-sm text-secondary" aria-busy="true">
                    O assistente está escrevendo…
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>

        {offerTicket ? (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text">Deseja abrir um chamado com nossa equipe?</p>
            <div className="flex gap-2">
              <Button size="sm" isLoading={outcome.escalate.isPending} onClick={() => void escalate()}>
                Sim, abrir chamado
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => document.getElementById('mensagem-chat')?.focus()}
              >
                Continuar tentando
              </Button>
            </div>
          </div>
        ) : null}

        {isActive ? (
          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void submit(draft)
            }}
          >
            <label htmlFor="mensagem-chat" className="sr-only">
              Mensagem para o Assistente de TI
            </label>
            <textarea
              id="mensagem-chat"
              rows={1}
              value={draft}
              maxLength={4000}
              placeholder="Digite sua mensagem…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              className={cx(FIELD_BASE, 'max-h-40 min-h-11 resize-none')}
            />
            <Button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={!draft.trim() || pending !== null}
              icon={<SendHorizontal aria-hidden="true" className="size-4" />}
            >
              <span className="sr-only sm:not-sr-only">Enviar</span>
            </Button>
          </form>
        ) : (
          <p className="border-t border-border px-4 py-3 text-sm text-secondary">
            Esta conversa foi encerrada. Clique em “Nova conversa” para continuar.
          </p>
        )}
      </section>
    </div>
  )
}
