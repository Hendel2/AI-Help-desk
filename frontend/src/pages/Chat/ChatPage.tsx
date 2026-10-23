import { MessageSquarePlus } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cx, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { useAuth } from '@/features/auth/useAuth'
import {
  ChatComposer,
  ChatLog,
  FinishActions,
  TicketOffer,
} from '@/features/chat/components/ChatSessionParts'
import { CONVERSATION_STATUS_LABELS } from '@/features/chat/labels'
import { useConversations } from '@/features/chat/hooks/useChat'
import { useChatSession } from '@/features/chat/hooks/useChatSession'
import { formatRelative } from '@/utils/format'

const INPUT_ID = 'mensagem-chat'

/** Assistente de TI em tela cheia (§45, §46). A conversa ativa fica na URL (?conversa=ID). */
export function ChatPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const conversationId = Number(searchParams.get('conversa')) || null
  const conversations = useConversations()
  const session = useChatSession({
    conversationId,
    onConversationCreated: (id) => setSearchParams({ conversa: String(id) }),
  })

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
                    {CONVERSATION_STATUS_LABELS[item.status]}, {formatRelative(item.updated_at)}
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
              <h1 className="text-lg font-bold text-text">Assistente de TI</h1>
              {session.basicMode ? <Badge tone="warning">Sem IA</Badge> : null}
            </div>
            <p className="text-xs text-secondary">
              {session.basicMode
                ? 'Modo básico: eu sugiro procedimentos da base de conhecimento e abro um chamado quando precisar. Nunca informe senhas.'
                : 'Conte o problema com suas palavras. Se eu não conseguir resolver, abro um chamado para a equipe. Nunca informe senhas.'}
            </p>
          </div>
          <FinishActions session={session} />
        </header>

        <ChatLog session={session} userName={user?.name ?? 'Você'} />
        <TicketOffer session={session} inputId={INPUT_ID} />
        <ChatComposer
          session={session}
          inputId={INPUT_ID}
          closedHint="Esta conversa foi encerrada. Clique em “Nova conversa” para continuar."
        />
      </section>
    </div>
  )
}
