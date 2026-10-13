import { zodResolver } from '@hookform/resolvers/zod'
import { Lock } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/styles'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/useToast'
import { getErrorMessage } from '@/services/api/errors'
import { formatDateTime, formatRelative } from '@/utils/format'

import { useAddComment, useTicketComments } from '../hooks/useTickets'
import type { Ticket, TicketComment } from '../types'

const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Escreva uma mensagem.')
    .max(10_000, 'A mensagem deve ter no máximo 10.000 caracteres.'),
  isInternal: z.boolean(),
})

type CommentFormValues = z.infer<typeof commentSchema>

interface TicketConversationProps {
  ticket: Ticket
  /** Técnicos e administradores veem e criam comentários internos (§18). */
  isStaff: boolean
  /** Texto a acrescentar na resposta (ex.: rascunho do AI Copilot). */
  insertText?: string | null
  onTextInserted?: () => void
}

const CLOSED_STATUSES = new Set(['CLOSED', 'CANCELLED'])

/** Conversa do chamado: descrição original, comentários e resposta (§43). */
export function TicketConversation({
  ticket,
  isStaff,
  insertText,
  onTextInserted,
}: TicketConversationProps) {
  const comments = useTicketComments(ticket.id)
  const isClosed = CLOSED_STATUSES.has(ticket.status)

  return (
    <div className="space-y-6">
      <ol className="space-y-4" aria-label="Mensagens do chamado">
        <li>
          <Message
            authorName={ticket.requester.name}
            createdAt={ticket.created_at}
            content={ticket.description}
            badge="Abertura"
          />
        </li>
        {comments.isPending ? (
          <li>
            <SkeletonText lines={3} />
          </li>
        ) : comments.isError ? (
          <li>
            <ErrorState
              title="Não foi possível carregar os comentários."
              description={getErrorMessage(comments.error)}
              onRetry={() => void comments.refetch()}
              isRetrying={comments.isFetching}
              className="py-6"
            />
          </li>
        ) : (
          comments.data.map((comment) => (
            <li key={comment.id}>
              <CommentMessage comment={comment} />
            </li>
          ))
        )}
      </ol>

      {comments.isSuccess && comments.data.length === 0 ? (
        <EmptyState
          title="Nenhuma resposta ainda."
          description="As mensagens da equipe de suporte aparecerão aqui."
          className="py-6"
        />
      ) : null}

      {isClosed ? (
        <p className="rounded-md border border-border bg-surface-hover px-4 py-3 text-sm text-secondary">
          Este chamado está encerrado e não aceita novas mensagens.
        </p>
      ) : (
        <CommentForm
          ticketId={ticket.id}
          isStaff={isStaff}
          insertText={insertText}
          onTextInserted={onTextInserted}
        />
      )}
    </div>
  )
}

function CommentMessage({ comment }: { comment: TicketComment }) {
  return (
    <Message
      authorName={comment.author.name}
      createdAt={comment.created_at}
      content={comment.content}
      isInternal={comment.is_internal}
    />
  )
}

interface MessageProps {
  authorName: string
  createdAt: string
  content: string
  isInternal?: boolean
  badge?: string
}

function Message({ authorName, createdAt, content, isInternal = false, badge }: MessageProps) {
  return (
    <article
      className={cx(
        'flex gap-3 rounded-lg border p-4',
        isInternal ? 'border-warning/40 bg-warning-soft' : 'border-border bg-surface',
      )}
    >
      <Avatar name={authorName} size="sm" />
      <div className="min-w-0 flex-1 space-y-1">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-text">{authorName}</span>
          <time dateTime={createdAt} title={formatDateTime(createdAt)} className="text-xs text-secondary">
            {formatRelative(createdAt)}
          </time>
          {badge ? <span className="text-xs text-secondary">· {badge}</span> : null}
          {isInternal ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-text">
              <Lock aria-hidden="true" className="size-3 text-warning" />
              Comentário interno
            </span>
          ) : null}
        </header>
        <p className="text-sm break-words whitespace-pre-wrap text-text">{content}</p>
      </div>
    </article>
  )
}

interface CommentFormProps {
  ticketId: number
  isStaff: boolean
  insertText?: string | null
  onTextInserted?: () => void
}

function CommentForm({ ticketId, isStaff, insertText, onTextInserted }: CommentFormProps) {
  const addComment = useAddComment(ticketId)
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: { content: '', isInternal: false },
  })

  // Acrescenta o texto recebido ao que já foi digitado; o envio continua manual.
  useEffect(() => {
    if (!insertText) return
    const current = getValues('content').trim()
    setValue('content', current ? `${current}

${insertText}` : insertText, {
      shouldDirty: true,
    })
    setFocus('content')
    onTextInserted?.()
  }, [insertText, getValues, setValue, setFocus, onTextInserted])

  const onSubmit = async ({ content, isInternal }: CommentFormValues) => {
    try {
      await addComment.mutateAsync({ content, isInternal })
      reset({ content: '', isInternal })
      showToast(isInternal ? 'Comentário interno adicionado.' : 'Mensagem enviada.')
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível enviar a mensagem.'), 'error')
    }
  }

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event)
      }}
    >
      <Textarea
        label="Responder"
        rows={4}
        placeholder="Escreva sua mensagem…"
        error={errors.content?.message}
        {...register('content')}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {isStaff ? (
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              className="size-4 rounded border-border accent-primary"
              {...register('isInternal')}
            />
            Comentário interno (visível só para a equipe)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" isLoading={addComment.isPending}>
          Enviar
        </Button>
      </div>
    </form>
  )
}
