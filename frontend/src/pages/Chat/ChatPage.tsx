import { MessageSquarePlus, SendHorizontal } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FIELD_BASE, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { useToast } from '@/components/ui/useToast'
import { useAuth } from '@/features/auth/useAuth'
import { ChatMessage } from '@/features/chat/components/ChatMessage'
import {
  useAssistantInfo,
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
  // Enquanto não se sabe (carregando/erro), vale o texto padrão: nada de alarme falso.
  const assistant = useAssistantInfo()
  const basicMode = assistant.data?.ai_enabled === false
  const slowAI = assistant.data?.slow_responses === true
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
  // Depois da primeira resposta, dá para encerrar ou falar com a equipe a qualquer momento.
  const canFinish =
    conversationId !== null && isActive && lastAssistant !== undefined && pending === null

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

  const resolve = async () => {
    try {
      await outcome.resolve.mutateAsync()
      showToast('Que bom que resolveu! A conversa foi encerrada.')
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível encerrar a conversa.'), 'error')
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
                    'group w-full rounded-lg px-3 py-2 text-left transition-colors',
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
                    {STATUS_LABELS[item.status]}, {formatRelative(item.updated_at)}
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
        className="flex h-[calc(100dvh-9.5rem)] min-h-96 flex-col rounded-xl border border-border bg-surface shadow-card lg:h-[calc(100dvh-11.5rem)]"
      >
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-text">Assistente de TI</h1>
              {basicMode ? <Badge tone="warning">Sem IA</Badge> : null}
            </div>
            <p className="text-xs text-secondary">
              {basicMode
                ? 'Modo básico: eu sugiro procedimentos da base de conhecimento e abro um chamado quando precisar. Nunca informe senhas.'
                : 'Conte o problema com suas palavras. Se eu não conseguir resolver, abro um chamado para a equipe. Nunca informe senhas.'}
            </p>
          </div>
          {canFinish ? (
            // Desfechos sempre à mão: a pessoa não depende da IA oferecer o chamado.
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="ghost"
                isLoading={outcome.resolve.isPending}
                onClick={() => void resolve()}
              >
                Resolvido
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isLoading={outcome.escalate.isPending}
                onClick={() => void escalate()}
              >
                Falar com a equipe
              </Button>
            </div>
          ) : null}
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
            <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-5 py-10">
              <div className="space-y-1">
                <p className="text-lg font-semibold tracking-tight text-text">
                  Olá! Como posso ajudar?
                </p>
                <p className="text-sm text-secondary">
                  Descreva o problema com suas palavras ou comece por um destes:
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void submit(example)}
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
                    {slowAI ? ' A IA local pode levar até 1 minuto.' : null}
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
              <Button
                size="sm"
                isLoading={outcome.escalate.isPending}
                onClick={() => void escalate()}
              >
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
