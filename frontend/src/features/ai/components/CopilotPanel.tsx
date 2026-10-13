import { BookOpen, FileText, History, Lightbulb, MessageSquareReply } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { Textarea } from '@/components/ui/Textarea'
import { getErrorMessage } from '@/services/api/errors'

import { useCopilot } from '../hooks/useCopilot'
import type { CopilotAction, CopilotSource } from '../types'

type PanelAction = CopilotAction | 'find_articles'

const ACTIONS: Array<{ action: PanelAction; label: string; Icon: LucideIcon }> = [
  { action: 'summarize', label: 'Resumir chamado', Icon: FileText },
  { action: 'suggest_solution', label: 'Sugerir solução', Icon: Lightbulb },
  { action: 'find_articles', label: 'Encontrar artigos', Icon: BookOpen },
  { action: 'generate_response', label: 'Gerar resposta', Icon: MessageSquareReply },
  { action: 'analyze_history', label: 'Analisar histórico', Icon: History },
]

const RESULT_TITLES: Record<CopilotAction, string> = {
  summarize: 'Resumo do chamado',
  suggest_solution: 'Solução sugerida',
  generate_response: 'Rascunho de resposta',
  analyze_history: 'Análise do histórico',
}

interface CopilotPanelProps {
  ticketId: number
  /** Leva o texto revisado para a caixa de resposta (nunca envia sozinho). */
  onUseText?: (text: string) => void
}

/**
 * AI Copilot do técnico (§30, §44). Tudo aqui é sugestão: o texto é editável e só
 * vira mensagem quando o técnico o leva para a resposta e clica em "Enviar".
 */
export function CopilotPanel({ ticketId, onUseText }: CopilotPanelProps) {
  const { run, articles } = useCopilot(ticketId)
  const [last, setLast] = useState<PanelAction | null>(null)
  const [draft, setDraft] = useState('')

  const trigger = (action: PanelAction) => {
    setLast(action)
    if (action === 'find_articles') {
      run.reset()
      articles.mutate()
    } else {
      articles.reset()
      run.mutate(action, { onSuccess: (data) => setDraft(data.text) })
    }
  }

  const current = last === 'find_articles' ? articles : run
  const busy = run.isPending || articles.isPending

  return (
    <Card title="AI Copilot">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {ACTIONS.map(({ action, label, Icon }) => (
            <Button
              key={action}
              size="sm"
              variant="secondary"
              icon={<Icon aria-hidden="true" className="size-4" />}
              disabled={busy}
              onClick={() => trigger(action)}
              className="justify-start"
            >
              {label}
            </Button>
          ))}
        </div>

        <div aria-live="polite">
          {last === null ? (
            <p className="text-xs text-secondary">
              As sugestões da IA são revisadas por você antes de qualquer envio.
            </p>
          ) : current.isPending ? (
            <div aria-busy="true">
              <span className="sr-only">Gerando sugestão…</span>
              <SkeletonText lines={4} />
            </div>
          ) : current.isError ? (
            <ErrorState
              title="O Copilot não conseguiu responder."
              description={getErrorMessage(current.error)}
              onRetry={() => trigger(last)}
              className="py-4"
            />
          ) : last === 'find_articles' && articles.data ? (
            <ArticleSuggestions items={articles.data} />
          ) : run.data ? (
            <div className="space-y-3">
              <Textarea
                label={RESULT_TITLES[run.data.action]}
                hint={
                  run.data.mode === 'heuristic'
                    ? 'Gerado por regras locais (IA generativa não configurada). Revise antes de usar.'
                    : 'Gerado por IA. Revise antes de usar.'
                }
                rows={8}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              {run.data.sources.length > 0 ? (
                <SourceLinks label="Fontes" items={run.data.sources} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                {onUseText ? (
                  <Button size="sm" disabled={!draft.trim()} onClick={() => onUseText(draft.trim())}>
                    Adicionar ao comentário
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLast(null)
                    run.reset()
                  }}
                >
                  Descartar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function ArticleSuggestions({ items }: { items: CopilotSource[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhum artigo relacionado."
        description="A base de conhecimento ainda não cobre este assunto."
        className="py-4"
      />
    )
  }
  return <SourceLinks label="Artigos relacionados" items={items} withExcerpt />
}

interface SourceLinksProps {
  label: string
  items: CopilotSource[]
  withExcerpt?: boolean
}

function SourceLinks({ label, items, withExcerpt = false }: SourceLinksProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-secondary">{label}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.article_id}>
            <Link
              to={`/base-de-conhecimento/${item.article_id}`}
              className={cx(
                'rounded-sm text-sm font-medium text-primary hover:underline',
                FOCUS_RING,
              )}
            >
              {item.title}
            </Link>
            {withExcerpt && item.excerpt ? (
              <p className="line-clamp-2 text-xs text-secondary">{item.excerpt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
