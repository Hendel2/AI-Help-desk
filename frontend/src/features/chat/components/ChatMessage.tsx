import { BookOpen, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { BrandMark } from '@/components/BrandMark'
import { Avatar } from '@/components/ui/Avatar'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { useToast } from '@/components/ui/useToast'
import { getErrorMessage } from '@/services/api/errors'

import { useMessageFeedback } from '../hooks/useChat'
import type { ChatMessageData } from '../types'

interface ChatMessageProps {
  message: ChatMessageData
  userName: string
}

/** Mensagem do chat (§46): usuário, Assistente de TI (com fontes) ou aviso do sistema. */
export function ChatMessage({ message, userName }: ChatMessageProps) {
  if (message.role === 'SYSTEM') {
    return (
      <p className="mx-auto max-w-md rounded-md bg-surface-hover px-3 py-2 text-center text-sm text-text">
        {message.content}
      </p>
    )
  }

  const isUser = message.role === 'USER'
  return (
    <div className={cx('flex gap-3', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <Avatar name={userName} size="sm" />
      ) : (
        <BrandMark withName={false} className="size-8 shrink-0 justify-center" />
      )}
      <div className={cx('max-w-[85%] space-y-2 sm:max-w-[75%]', isUser && 'items-end text-right')}>
        <p className="text-xs font-medium text-secondary">{isUser ? 'Você' : 'Assistente de TI'}</p>
        <div
          className={cx(
            'rounded-lg px-4 py-3 text-left text-sm break-words whitespace-pre-line',
            isUser ? 'bg-primary-soft text-text' : 'border border-border bg-surface text-text',
          )}
        >
          {message.content}
        </div>
        {!isUser && message.sources && message.sources.length > 0 ? (
          <div className="text-left text-xs text-secondary">
            <p className="font-medium">Fonte{message.sources.length > 1 ? 's' : ''}:</p>
            <ul className="mt-1 space-y-0.5">
              {message.sources.map((source) => (
                <li key={source.article_id}>
                  <Link
                    to={`/base-de-conhecimento/${source.article_id}`}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-sm text-text underline-offset-2 hover:text-primary hover:underline',
                      FOCUS_RING,
                    )}
                  >
                    <BookOpen aria-hidden="true" className="size-3" />
                    {source.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!isUser ? <FeedbackButtons messageId={message.id} /> : null}
      </div>
    </div>
  )
}

/** Avaliação 👍/👎 da resposta (§70). */
function FeedbackButtons({ messageId }: { messageId: number }) {
  const feedback = useMessageFeedback()
  const { showToast } = useToast()
  const [sent, setSent] = useState<'POSITIVE' | 'NEGATIVE' | null>(null)

  if (sent) {
    return <p className="text-left text-xs text-secondary">Obrigado pela avaliação.</p>
  }

  const rate = (rating: 'POSITIVE' | 'NEGATIVE') => {
    feedback.mutate(
      { messageId, rating },
      {
        onSuccess: () => setSent(rating),
        onError: (error) => showToast(getErrorMessage(error), 'error'),
      },
    )
  }

  const buttonClass = cx(
    'rounded-md p-1.5 text-secondary transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50',
    FOCUS_RING,
  )
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className={buttonClass}
        disabled={feedback.isPending}
        aria-label="Resposta útil"
        onClick={() => rate('POSITIVE')}
      >
        <ThumbsUp aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={feedback.isPending}
        aria-label="Resposta não ajudou"
        onClick={() => rate('NEGATIVE')}
      >
        <ThumbsDown aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
