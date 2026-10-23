import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  KeyRound,
  Laptop,
  Mail,
  Maximize2,
  MessageSquare,
  Printer,
  ShieldCheck,
  SquarePen,
  Ticket,
  Wifi,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { AssistantAvatar } from '@/components/AssistantAvatar'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FIELD_BASE, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { useAuth } from '@/features/auth/useAuth'
import { useDashboardMetrics } from '@/features/dashboard/hooks/useDashboard'
import { formatRelative } from '@/utils/format'
import { greeting } from '@/utils/greeting'

import { useConversations } from '../hooks/useChat'
import { useAssistantState } from '../hooks/useAssistantState'
import { useChatSession } from '../hooks/useChatSession'
import { CONVERSATION_STATUS_LABELS } from '../labels'
import type { ConversationStatus, ConversationSummary } from '../types'
import { useAssistantWidget } from '../widget/assistantWidgetContext'
import { ChatComposer, ChatLog, QuickReplies, TicketOffer } from './ChatSessionParts'

const INPUT_ID = 'mensagem-assistente-flutuante'
const HOME_INPUT_ID = 'problema-assistente-flutuante'

/** Assuntos comuns: um toque começa a conversa com a frase pronta. */
const TOPICS: Array<{ label: string; icon: LucideIcon; message: string }> = [
  { label: 'Internet', icon: Wifi, message: 'Minha internet está com problema.' },
  { label: 'VPN', icon: ShieldCheck, message: 'Minha VPN não conecta.' },
  { label: 'E-mail', icon: Mail, message: 'Estou com problema no e-mail.' },
  { label: 'Impressora', icon: Printer, message: 'A impressora não está imprimindo.' },
  { label: 'Senha', icon: KeyRound, message: 'Preciso de ajuda com a minha senha.' },
  { label: 'Computador', icon: Laptop, message: 'Meu computador está com problema.' },
]

const STATUS_ICONS: Record<ConversationStatus, LucideIcon> = {
  ACTIVE: MessageSquare,
  RESOLVED: CheckCircle2,
  ESCALATED: Ticket,
  CLOSED: MessageSquare,
}

/**
 * Assistente de TI flutuante: o botão no canto abre um painel com a tela
 * inicial (descreva o problema, assuntos comuns, conversas em andamento e
 * avisos dos seus chamados), o histórico e a conversa — sem sair da tela atual.
 * Na página `/assistente` (a versão expandida) ele não aparece.
 */
export function ChatWidget() {
  const widget = useAssistantWidget()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const state = useAssistantState()
  const panelId = useId()
  const launcherRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { isOpen, view, close } = widget

  // Ao abrir ou trocar de tela, o foco vai para o campo principal (ou para o painel).
  useEffect(() => {
    if (!isOpen) return
    const target = document.getElementById(view === 'chat' ? INPUT_ID : HOME_INPUT_ID)
    ;(target ?? panelRef.current)?.focus()
  }, [isOpen, view, widget.sessionKey])

  // Esc dentro do painel fecha e devolve o foco ao botão (outros overlays não são afetados).
  useEffect(() => {
    const panel = panelRef.current
    if (!isOpen || !panel) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
      launcherRef.current?.focus()
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  if (pathname.startsWith('/assistente')) return null

  const closeAndFocus = () => {
    close()
    launcherRef.current?.focus()
  }
  const expand = () => {
    close()
    const id = view === 'chat' ? widget.conversationId : null
    void navigate(id ? `/assistente?conversa=${id}` : '/assistente')
  }
  const frame = { onExpand: expand, onClose: closeAndFocus }

  return (
    <aside aria-label="Assistente de TI">
      {isOpen ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Assistente de TI"
          tabIndex={-1}
          className="fixed inset-0 z-40 flex origin-bottom-right flex-col overflow-hidden bg-surface-raised transition duration-150 ease-out focus:outline-none motion-reduce:transition-none starting:scale-95 starting:opacity-0 sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(42rem,calc(100dvh-8rem))] sm:w-100 sm:rounded-3xl sm:border sm:border-border sm:shadow-overlay"
        >
          {view === 'chat' ? (
            <ConversationView key={widget.sessionKey} {...frame} />
          ) : view === 'history' ? (
            <HistoryView {...frame} />
          ) : (
            <HomeView {...frame} onNavigate={close} />
          )}
        </div>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={isOpen ? 'Minimizar o Assistente de TI' : 'Abrir o Assistente de TI'}
        onClick={() => (isOpen ? closeAndFocus() : widget.open())}
        className={cx(
          'group fixed right-4 bottom-4 z-40 rounded-2xl sm:right-6 sm:bottom-6',
          // No celular o painel ocupa a tela e tem o próprio botão de fechar.
          isOpen && 'max-sm:hidden',
          FOCUS_RING,
        )}
      >
        {/* Dica no hover, fora da área clicável (não captura cliques sem estar visível). */}
        {!isOpen ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-full mr-3 hidden -translate-y-1/2 translate-x-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm font-semibold whitespace-nowrap text-text opacity-0 shadow-overlay transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none sm:block"
          >
            Precisa de ajuda?
          </span>
        ) : null}
        <span className="relative flex size-14 items-center justify-center rounded-2xl bg-primary shadow-overlay ring-4 ring-backdrop transition-transform duration-150 group-hover:-translate-y-0.5 motion-reduce:transition-none">
          {isOpen ? (
            <ChevronDown aria-hidden="true" className="size-6 text-on-primary" />
          ) : (
            <AssistantAvatar framed={false} className="size-11" />
          )}
          {state && !isOpen ? (
            <span
              aria-hidden="true"
              className={cx(
                'absolute -top-1 -right-1 size-3.5 rounded-full ring-2 ring-backdrop',
                state.dot,
              )}
            />
          ) : null}
        </span>
      </button>
    </aside>
  )
}

interface FrameProps {
  onExpand: () => void
  onClose: () => void
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
        FOCUS_RING,
      )}
    >
      {children}
    </button>
  )
}

/** Cabeçalho compacto de todas as telas: o que é, como está e as ações da janela. */
function PanelHeader({
  leading,
  title,
  subtitle,
  extra,
  onExpand,
  onClose,
}: FrameProps & { leading: ReactNode; title: string; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-sm font-semibold text-text">{title}</h2>
        {subtitle ? (
          <p className="flex items-center gap-1.5 truncate text-xs text-secondary">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {extra}
        <IconButton label="Abrir em tela cheia" onClick={onExpand}>
          <Maximize2 aria-hidden="true" className="size-4.5" />
        </IconButton>
        <IconButton label="Fechar" onClick={onClose}>
          <X aria-hidden="true" className="size-5" />
        </IconButton>
      </div>
    </div>
  )
}

function StatusLine() {
  const state = useAssistantState()
  if (!state) return null
  return (
    <>
      <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', state.dot)} />
      {state.detail}
    </>
  )
}

function HomeView({ onNavigate, ...frame }: FrameProps & { onNavigate: () => void }) {
  const widget = useAssistantWidget()
  const { user } = useAuth()
  const conversations = useConversations(true)
  const [draft, setDraft] = useState('')
  const firstName = user?.name.split(' ')[0] ?? ''
  const ongoing = (conversations.data ?? []).filter((item) => item.status === 'ACTIVE').slice(0, 3)

  const ask = () => {
    if (draft.trim()) widget.startConversation(draft)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      ask()
    }
  }

  return (
    <>
      <PanelHeader
        leading={<AssistantAvatar className="size-9" />}
        title="Assistente de TI"
        subtitle={<StatusLine />}
        extra={
          <IconButton label="Conversas anteriores" onClick={widget.showHistory}>
            <History aria-hidden="true" className="size-4.5" />
          </IconButton>
        }
        {...frame}
      />
      <div className="flex-1 overflow-y-auto">
        <form
          className="space-y-3 border-b border-border bg-background bg-dots px-5 pt-5 pb-4"
          onSubmit={(event) => {
            event.preventDefault()
            ask()
          }}
        >
          <div>
            <p className="text-sm text-secondary">
              {greeting(new Date())}, {firstName}.
            </p>
            {/* A pergunta é o rótulo visível do campo. */}
            <label
              htmlFor={HOME_INPUT_ID}
              className="mt-0.5 block font-display text-xl font-semibold tracking-tight text-text"
            >
              Qual é o problema hoje?
            </label>
          </div>
          <div className="relative">
            <textarea
              id={HOME_INPUT_ID}
              rows={2}
              value={draft}
              maxLength={4000}
              placeholder="Descreva com suas palavras. Ex.: a VPN não conecta"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              className={cx(FIELD_BASE, 'min-h-20 resize-none rounded-xl pr-14')}
            />
            <button
              type="submit"
              aria-label="Começar a conversa"
              disabled={!draft.trim()}
              className={cx(
                'absolute right-2 bottom-2 rounded-lg bg-primary p-2 text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50',
                FOCUS_RING,
              )}
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
          </div>
          <p className="text-xs text-secondary">Enter envia. Nunca informe senhas.</p>
        </form>

        <div className="space-y-6 p-4">
          <section aria-labelledby={`${HOME_INPUT_ID}-assuntos`}>
            <h3 id={`${HOME_INPUT_ID}-assuntos`} className="text-xs font-semibold text-secondary">
              Assuntos comuns
            </h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TOPICS.map(({ label, icon: Icon, message }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => widget.startConversation(message)}
                  className={cx(
                    'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-2 py-3 text-xs font-semibold text-text shadow-card transition-colors hover:border-border-strong hover:bg-surface-hover',
                    FOCUS_RING,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary"
                  >
                    <Icon className="size-4" />
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </section>

          {conversations.isPending ? (
            <SkeletonText lines={3} />
          ) : ongoing.length > 0 ? (
            <section aria-labelledby={`${HOME_INPUT_ID}-andamento`}>
              <div className="flex items-center justify-between gap-2">
                <h3
                  id={`${HOME_INPUT_ID}-andamento`}
                  className="text-xs font-semibold text-secondary"
                >
                  Continue de onde parou
                </h3>
                <button
                  type="button"
                  onClick={widget.showHistory}
                  className={cx(
                    'rounded-md text-xs font-semibold text-primary hover:underline',
                    FOCUS_RING,
                  )}
                >
                  Ver todas
                </button>
              </div>
              <ConversationList items={ongoing} className="mt-2" />
            </section>
          ) : null}

          <TicketHint onNavigate={onNavigate} />
        </div>
      </div>
    </>
  )
}

/** Lista de conversas (andamento e histórico): um toque abre no painel. */
function ConversationList({
  items,
  className,
}: {
  items: ConversationSummary[]
  className?: string
}) {
  const widget = useAssistantWidget()
  return (
    <ul
      className={cx(
        'divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = STATUS_ICONS[item.status]
        const title = item.title ?? 'Nova conversa'
        const status = `${CONVERSATION_STATUS_LABELS[item.status]}, ${formatRelative(item.updated_at)}`
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => widget.openConversation(item.id)}
              // Nome explícito: título e situação viram uma frase para leitores de tela.
              aria-label={`${title}: ${status}`}
              className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{title}</span>
                <span className={cx('block text-xs', SECONDARY_ON_TINT)}>{status}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-secondary" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** O assistente conhece seus chamados: avisa o que pede atenção (e leva até lá). */
function TicketHint({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth()
  const metrics = useDashboardMetrics(30)
  const data = metrics.data
  if (!user || !data) return null

  const hint =
    user.role === 'USER'
      ? data.waiting_user > 0
        ? {
            text: `${plural(data.waiting_user, 'chamado aguarda', 'chamados aguardam')} sua resposta`,
            to: '/chamados/meus?status=WAITING_USER',
            tone: 'bg-warning-soft text-warning',
          }
        : null
      : data.sla_breached > 0
        ? {
            text: `${plural(data.sla_breached, 'chamado', 'chamados')} com SLA vencido`,
            to: '/chamados',
            tone: 'bg-danger-soft text-danger',
          }
        : null
  if (!hint) return null

  return (
    <Link
      to={hint.to}
      onClick={onNavigate}
      className={cx(
        'group flex items-center gap-3 rounded-xl border border-border bg-surface p-2 pr-3 text-sm font-semibold text-text transition-colors hover:border-border-strong',
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden="true"
        className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', hint.tone)}
      >
        <AlertTriangle className="size-4" />
      </span>
      <span className="min-w-0 flex-1">{hint.text}</span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-secondary" />
    </Link>
  )
}

function HistoryView(frame: FrameProps) {
  const widget = useAssistantWidget()
  const conversations = useConversations(true)

  return (
    <>
      <PanelHeader
        leading={
          <IconButton label="Voltar ao início do assistente" onClick={widget.showHome}>
            <ArrowLeft aria-hidden="true" className="size-5" />
          </IconButton>
        }
        title="Conversas"
        subtitle="Tudo o que você já falou com o assistente"
        {...frame}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {conversations.isPending ? (
          <SkeletonText lines={5} />
        ) : conversations.isError ? (
          <ErrorState
            title="Não foi possível carregar as conversas."
            onRetry={() => void conversations.refetch()}
            className="py-8"
          />
        ) : conversations.data.length === 0 ? (
          <EmptyState
            title="Nenhuma conversa ainda."
            description="Descreva um problema e eu ajudo a resolver."
            icon={MessageSquare}
            className="py-10"
          />
        ) : (
          <ConversationList items={conversations.data} />
        )}
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => widget.startConversation()}
          className={cx(
            'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-card transition-colors hover:bg-primary-hover',
            FOCUS_RING,
          )}
        >
          <SquarePen aria-hidden="true" className="size-4" />
          Nova conversa
        </button>
      </div>
    </>
  )
}

function ConversationView(frame: FrameProps) {
  const widget = useAssistantWidget()
  const { user } = useAuth()
  const session = useChatSession({
    conversationId: widget.conversationId,
    onConversationCreated: widget.rememberConversation,
    onEscalated: widget.close,
  })
  const sentInitial = useRef(false)
  const { initialMessage } = widget
  const { submit } = session

  // Conversa iniciada pela tela inicial (ou pela barra do início): envia a 1ª mensagem uma vez.
  useEffect(() => {
    if (!initialMessage || sentInitial.current) return
    sentInitial.current = true
    void submit(initialMessage)
  }, [initialMessage, submit])

  return (
    <>
      <PanelHeader
        leading={
          <>
            <IconButton label="Voltar ao início do assistente" onClick={widget.showHome}>
              <ArrowLeft aria-hidden="true" className="size-5" />
            </IconButton>
            <AssistantAvatar className="size-8" />
          </>
        }
        title={session.conversation.data?.title ?? 'Nova conversa'}
        subtitle={<StatusLine />}
        extra={
          <IconButton label="Nova conversa" onClick={() => widget.startConversation()}>
            <SquarePen aria-hidden="true" className="size-4.5" />
          </IconButton>
        }
        {...frame}
      />
      <ChatLog
        session={session}
        userName={user?.name ?? 'Você'}
        compact
        after={<QuickReplies session={session} />}
      />
      <TicketOffer session={session} inputId={INPUT_ID} />
      <ChatComposer
        session={session}
        inputId={INPUT_ID}
        closedHint="Esta conversa foi encerrada. Comece uma nova pelo ícone de lápis."
      />
    </>
  )
}
