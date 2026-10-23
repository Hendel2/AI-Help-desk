import {
  ArrowLeft,
  ChevronRight,
  House,
  Maximize2,
  MessageSquarePlus,
  MessagesSquare,
  SendHorizontal,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { AssistantAvatar } from '@/components/AssistantAvatar'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { useAuth } from '@/features/auth/useAuth'
import { formatRelative } from '@/utils/format'

import { useAssistantInfo, useConversations } from '../hooks/useChat'
import { useChatSession } from '../hooks/useChatSession'
import { CONVERSATION_STATUS_LABELS } from '../labels'
import { ChatComposer, ChatLog, FinishActions, TicketOffer } from './ChatSessionParts'

type View = 'home' | 'messages' | 'chat'

const INPUT_ID = 'mensagem-assistente-flutuante'

/** Como o assistente responde agora, em uma linha (com a cor do ponto). */
function useAssistantState(): { text: string; dot: string } | null {
  const info = useAssistantInfo()
  if (!info.data) return null
  if (!info.data.ai_enabled) return { text: 'Sem IA: sugiro os guias da base', dot: 'bg-secondary' }
  if (info.data.slow_responses)
    return { text: 'IA local: respostas mais lentas', dot: 'bg-warning' }
  return { text: 'IA ativa: respostas em segundos', dot: 'bg-success' }
}

/**
 * Assistente de TI flutuante: a bolinha no canto abre um painel com início,
 * conversas e a conversa em si, sem sair da tela atual (§45). Na página
 * `/assistente` (a versão expandida) ele não aparece.
 */
export function ChatWidget() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<View>('home')
  const [conversationId, setConversationId] = useState<number | null>(null)
  // Remonta a conversa só quando a pessoa escolhe outra (criar a conversa na 1ª mensagem
  // não pode descartar a mensagem pendente).
  const [sessionKey, setSessionKey] = useState(0)
  const panelId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Ao abrir ou trocar de tela, o foco vai para o painel (a conversa foca a caixa de texto).
  useEffect(() => {
    if (!isOpen) return
    const input = view === 'chat' ? document.getElementById(INPUT_ID) : null
    ;(input ?? panelRef.current)?.focus()
  }, [isOpen, view, conversationId])

  // Esc dentro do painel fecha e devolve o foco à bolinha (outros overlays não são afetados).
  useEffect(() => {
    const panel = panelRef.current
    if (!isOpen || !panel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setIsOpen(false)
      launcherRef.current?.focus()
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  if (pathname.startsWith('/assistente')) return null

  const close = () => {
    setIsOpen(false)
    launcherRef.current?.focus()
  }
  const openConversation = (id: number | null) => {
    setConversationId(id)
    setSessionKey((key) => key + 1)
    setView('chat')
  }
  const expand = () => {
    setIsOpen(false)
    void navigate(
      conversationId && view === 'chat' ? `/assistente?conversa=${conversationId}` : '/assistente',
    )
  }
  const headerActions = { onExpand: expand, onClose: close }

  return (
    <aside aria-label="Assistente de TI">
      {isOpen ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Assistente de TI"
          tabIndex={-1}
          className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface-raised transition duration-200 ease-out focus:outline-none motion-reduce:transition-none starting:translate-y-3 starting:opacity-0 sm:inset-auto sm:right-6 sm:bottom-26 sm:h-[min(40rem,calc(100dvh-8.5rem))] sm:w-96 sm:rounded-2xl sm:border sm:border-border sm:shadow-overlay"
        >
          {view === 'chat' ? (
            <ConversationView
              key={sessionKey}
              conversationId={conversationId}
              onCreated={setConversationId}
              onBack={() => setView('home')}
              onEscalated={() => setIsOpen(false)}
              {...headerActions}
            />
          ) : (
            <>
              {view === 'home' ? (
                <HomeView onOpenConversation={openConversation} {...headerActions} />
              ) : (
                <MessagesView onOpenConversation={openConversation} {...headerActions} />
              )}
              <nav
                aria-label="Seções do assistente"
                className="grid grid-cols-2 border-t border-border"
              >
                <TabButton
                  icon={House}
                  label="Início"
                  isActive={view === 'home'}
                  onClick={() => setView('home')}
                />
                <TabButton
                  icon={MessagesSquare}
                  label="Mensagens"
                  isActive={view === 'messages'}
                  onClick={() => setView('messages')}
                />
              </nav>
            </>
          )}
        </div>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={isOpen ? 'Fechar o Assistente de TI' : 'Abrir o Assistente de TI'}
        title="Assistente de TI"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cx(
          'fixed right-4 bottom-4 z-40 size-16 rounded-full shadow-overlay ring-4 ring-surface transition-transform hover:scale-105 motion-reduce:transition-none sm:right-6 sm:bottom-6',
          // No celular o painel ocupa a tela e tem o próprio botão de fechar.
          isOpen && 'max-sm:hidden',
          FOCUS_RING,
        )}
      >
        <AssistantAvatar className="size-full" />
      </button>
    </aside>
  )
}

interface HeaderActionsProps {
  onExpand: () => void
  onClose: () => void
}

/** Expandir para a página completa e fechar (no cabeçalho de todas as telas). */
function HeaderButtons({
  onExpand,
  onClose,
  onPrimary = false,
}: HeaderActionsProps & { onPrimary?: boolean }) {
  const button = cx(
    'rounded-lg p-2 transition-colors',
    onPrimary
      ? 'text-on-primary hover:bg-on-primary/15'
      : 'text-secondary hover:bg-surface-hover hover:text-text',
    FOCUS_RING,
  )
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Abrir em tela cheia"
        title="Abrir em tela cheia"
        className={button}
      >
        <Maximize2 aria-hidden="true" className="size-4.5" />
      </button>
      <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar" className={button}>
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}

function HomeView({
  onOpenConversation,
  ...headerActions
}: HeaderActionsProps & { onOpenConversation: (id: number | null) => void }) {
  const { user } = useAuth()
  const conversations = useConversations(true)
  const state = useAssistantState()
  const firstName = user?.name.split(' ')[0] ?? ''
  const recent = conversations.data?.[0]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-primary px-5 pt-4 pb-10 text-on-primary">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5">
            <AssistantAvatar className="size-9 rounded-full ring-2 ring-on-primary/30" />
            <span className="text-sm font-bold">Assistente de TI</span>
          </span>
          <HeaderButtons {...headerActions} onPrimary />
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight">
          Olá, {firstName} <span aria-hidden="true">👋</span>
        </h2>
        <p className="text-xl font-bold tracking-tight">Como podemos ajudar?</p>
      </div>

      <div className="-mt-6 space-y-3 px-4 pb-4">
        {conversations.isPending ? (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <SkeletonText lines={2} />
          </div>
        ) : recent ? (
          <button
            type="button"
            onClick={() => onOpenConversation(recent.id)}
            // Nome explícito: os três textos visuais viram uma frase para leitores de tela.
            aria-label={`Mensagem recente: ${recent.title ?? 'Nova conversa'}, ${formatRelative(recent.updated_at)}`}
            className={cx(
              'group block w-full rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-hover',
              FOCUS_RING,
            )}
          >
            <span className="block text-sm font-bold text-text">Mensagem recente</span>
            <span className="mt-1 flex items-center gap-3">
              <span className={cx('min-w-0 flex-1 truncate text-sm', SECONDARY_ON_TINT)}>
                {recent.title ?? 'Nova conversa'}
              </span>
              <span className={cx('shrink-0 text-xs', SECONDARY_ON_TINT)}>
                {formatRelative(recent.updated_at)}
              </span>
            </span>
          </button>
        ) : null}

        {recent?.status === 'ACTIVE' ? (
          <HomeAction
            label="Continuar conversando"
            icon={SendHorizontal}
            onClick={() => onOpenConversation(recent.id)}
          />
        ) : null}
        <HomeAction
          label="Iniciar nova conversa"
          icon={MessageSquarePlus}
          onClick={() => onOpenConversation(null)}
        />

        {state ? (
          <p className="flex items-center justify-center gap-2 pt-2 text-xs text-secondary">
            <span aria-hidden="true" className={cx('size-2 rounded-full', state.dot)} />
            {state.text}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function HomeAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-text shadow-card transition-colors hover:bg-surface-hover',
        FOCUS_RING,
      )}
    >
      {label}
      <Icon aria-hidden="true" className="size-4 text-primary" />
    </button>
  )
}

function MessagesView({
  onOpenConversation,
  ...headerActions
}: HeaderActionsProps & { onOpenConversation: (id: number | null) => void }) {
  const conversations = useConversations(true)

  return (
    <>
      <PanelHeader title="Mensagens" {...headerActions} />
      <div className="flex-1 overflow-y-auto">
        {conversations.isPending ? (
          <SkeletonText lines={5} className="p-4" />
        ) : conversations.isError ? (
          <ErrorState
            title="Não foi possível carregar as conversas."
            onRetry={() => void conversations.refetch()}
            className="py-8"
          />
        ) : conversations.data.length === 0 ? (
          <EmptyState
            title="Nenhuma conversa ainda."
            description="Comece uma conversa e eu ajudo a resolver."
            icon={MessagesSquare}
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border">
            {conversations.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenConversation(item.id)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                  <AssistantAvatar className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">
                      {item.title ?? 'Nova conversa'}
                    </span>
                    <span className={cx('block text-xs', SECONDARY_ON_TINT)}>
                      {CONVERSATION_STATUS_LABELS[item.status]}, {formatRelative(item.updated_at)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-secondary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border p-3">
        <HomeAction
          label="Nova conversa"
          icon={MessageSquarePlus}
          onClick={() => onOpenConversation(null)}
        />
      </div>
    </>
  )
}

function ConversationView({
  conversationId,
  onCreated,
  onBack,
  onEscalated,
  ...headerActions
}: HeaderActionsProps & {
  conversationId: number | null
  onCreated: (id: number) => void
  onBack: () => void
  onEscalated: () => void
}) {
  const { user } = useAuth()
  const state = useAssistantState()
  const session = useChatSession({
    conversationId,
    onConversationCreated: onCreated,
    onEscalated,
  })

  return (
    <>
      <PanelHeader
        title="Assistente de TI"
        subtitle={
          state ? (
            <>
              <span aria-hidden="true" className={cx('size-2 rounded-full', state.dot)} />
              {state.text}
            </>
          ) : null
        }
        onBack={onBack}
        {...headerActions}
      />
      {session.canFinish ? (
        <div className="border-b border-border px-3 py-2">
          <FinishActions session={session} compact />
        </div>
      ) : null}
      <ChatLog session={session} userName={user?.name ?? 'Você'} compact />
      <TicketOffer session={session} inputId={INPUT_ID} />
      <ChatComposer
        session={session}
        inputId={INPUT_ID}
        closedHint="Esta conversa foi encerrada. Volte e inicie uma nova conversa."
      />
    </>
  )
}

function PanelHeader({
  title,
  subtitle,
  onBack,
  onExpand,
  onClose,
}: HeaderActionsProps & { title: string; subtitle?: ReactNode; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2 py-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar ao início do assistente"
          className={cx(
            'rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
            FOCUS_RING,
          )}
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      {onBack ? <AssistantAvatar className="size-8" /> : null}
      <div className={cx('min-w-0 flex-1', !onBack && 'pl-2')}>
        <h2 className="truncate text-sm font-bold text-text">{title}</h2>
        {subtitle ? (
          <p className="flex items-center gap-1.5 truncate text-xs text-secondary">{subtitle}</p>
        ) : null}
      </div>
      <HeaderButtons onExpand={onExpand} onClose={onClose} />
    </div>
  )
}

function TabButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: LucideIcon
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={cx(
        'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors hover:bg-surface-hover',
        isActive ? 'text-primary' : 'text-secondary hover:text-text',
        FOCUS_RING,
      )}
    >
      <Icon aria-hidden="true" className="size-5" />
      {label}
    </button>
  )
}
