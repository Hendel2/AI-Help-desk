import { cx } from '@/components/ui/styles'

interface AssistantAvatarProps {
  className?: string
}

/**
 * Rosto do Assistente de TI: um robô com headset de atendimento. Decorativo
 * (quem usa dá o nome acessível) e desenhado com os tokens, então acompanha o tema.
 */
export function AssistantAvatar({ className }: AssistantAvatarProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cx('shrink-0', className)}>
      <circle cx="32" cy="32" r="32" className="fill-primary" />
      {/* Antena com a luz de "online" */}
      <path d="M32 19v-6" strokeWidth="2.5" strokeLinecap="round" className="stroke-surface" />
      <circle cx="32" cy="11.5" r="3" className="fill-success" />
      {/* Cabeça */}
      <rect x="17" y="19" width="30" height="26" rx="10" className="fill-surface" />
      <circle cx="26" cy="31" r="3.2" className="fill-primary" />
      <circle cx="38" cy="31" r="3.2" className="fill-primary" />
      <path
        d="M26.5 38.5q5.5 4.5 11 0"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-primary"
      />
      {/* Headset */}
      <path
        d="M13.5 32a18.5 18.5 0 0 1 37 0"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-surface"
      />
      <rect x="9.5" y="28" width="7" height="12" rx="3.5" className="fill-surface" />
      <rect x="47.5" y="28" width="7" height="12" rx="3.5" className="fill-surface" />
      <path
        d="M13 39.5q1 8.5 11 8.5"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-surface"
      />
      <circle cx="25" cy="48" r="2.6" className="fill-surface" />
    </svg>
  )
}
