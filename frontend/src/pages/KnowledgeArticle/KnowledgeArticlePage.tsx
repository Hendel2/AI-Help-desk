import { ArrowLeft, Pencil, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Modal } from '@/components/ui/Modal'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { useAuth } from '@/features/auth/useAuth'
import { ARTICLE_STATUS_LABELS } from '@/features/knowledge/labels'
import {
  useArticle,
  useArticleFeedback,
  useDeleteArticle,
} from '@/features/knowledge/hooks/useKnowledge'
import { getErrorMessage, isApiError } from '@/services/api/errors'
import { formatDateTime } from '@/utils/format'

/** Página de artigo (§49): conteúdo, autoria e "Este artigo ajudou?". */
export function KnowledgeArticlePage() {
  const { articleId } = useParams()
  const id = Number(articleId)
  const article = useArticle(id)
  const feedback = useArticleFeedback(id)
  const remove = useDeleteArticle()
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [voted, setVoted] = useState<boolean | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isAdmin = hasRole('ADMIN')

  const back = (
    <ButtonLink
      to="/base-de-conhecimento"
      variant="ghost"
      size="sm"
      icon={<ArrowLeft aria-hidden="true" className="size-4" />}
      className="-ml-3"
    >
      Base de conhecimento
    </ButtonLink>
  )

  if (article.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <SkeletonText lines={8} />
      </div>
    )
  }
  if (article.isError) {
    const notFound = isApiError(article.error) && article.error.status === 404
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {back}
        <ErrorState
          title={notFound ? 'Artigo não encontrado.' : 'Não foi possível carregar o artigo.'}
          description={notFound ? undefined : getErrorMessage(article.error)}
          onRetry={notFound ? undefined : () => void article.refetch()}
        />
      </div>
    )
  }

  const data = article.data
  const vote = async (helpful: boolean) => {
    try {
      await feedback.mutateAsync(helpful)
      setVoted(helpful)
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
    }
  }

  return (
    <article className="mx-auto w-full max-w-3xl space-y-6">
      {back}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold break-words text-text">{data.title}</h1>
          {isAdmin ? (
            <div className="flex gap-2">
              <ButtonLink
                to={`/base-de-conhecimento/${data.id}/editar`}
                variant="secondary"
                size="sm"
                icon={<Pencil aria-hidden="true" className="size-4" />}
              >
                Editar
              </ButtonLink>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 aria-hidden="true" className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </Button>
            </div>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary">
          {data.status !== 'PUBLISHED' ? (
            <Badge tone="neutral">{ARTICLE_STATUS_LABELS[data.status]}</Badge>
          ) : null}
          {data.category ? <Badge withDot={false}>{data.category.name}</Badge> : null}
          <span>
            {data.author ? `Escrito por ${data.author.name}, atualizado em ` : 'Atualizado em '}
            <time dateTime={data.updated_at}>{formatDateTime(data.updated_at)}</time>
          </span>
        </p>
        {data.summary ? <p className="text-text">{data.summary}</p> : null}
      </header>

      <div className="space-y-4 border-t border-border pt-6 text-text">
        {data.content.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index} className="leading-relaxed break-words whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>

      {data.source_file_name ? (
        <p className="text-xs text-secondary">Fonte: importado de {data.source_file_name}</p>
      ) : null}

      {data.status === 'PUBLISHED' ? (
        <section
          aria-label="Avaliação do artigo"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          {voted === null ? (
            <>
              <p className="text-sm font-medium text-text">Este artigo ajudou?</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={feedback.isPending}
                  icon={<ThumbsUp aria-hidden="true" className="size-4" />}
                  onClick={() => void vote(true)}
                >
                  Sim
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={feedback.isPending}
                  icon={<ThumbsDown aria-hidden="true" className="size-4" />}
                  onClick={() => void vote(false)}
                >
                  Não
                </Button>
              </div>
            </>
          ) : (
            <p role="status" className="text-sm text-text">
              {voted
                ? 'Obrigado pelo retorno!'
                : 'Obrigado pelo retorno. Se ainda precisar de ajuda, abra um chamado.'}
            </p>
          )}
          {voted === false ? (
            <ButtonLink to="/chamados/novo" size="sm">
              Abrir chamado
            </ButtonLink>
          ) : null}
        </section>
      ) : null}

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir artigo"
        description="O artigo sai da base e das respostas do Assistente de TI. Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              isLoading={remove.isPending}
              onClick={() =>
                void remove.mutateAsync(data.id).then(
                  () => {
                    showToast('Artigo excluído.')
                    void navigate('/base-de-conhecimento', { replace: true })
                  },
                  (error: unknown) => showToast(getErrorMessage(error), 'error'),
                )
              }
            >
              Excluir artigo
            </Button>
          </>
        }
      />
    </article>
  )
}
