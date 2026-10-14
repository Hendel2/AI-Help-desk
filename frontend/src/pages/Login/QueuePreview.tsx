import { CheckCircle2 } from 'lucide-react'

import { cx } from '@/components/ui/styles'

/** Trecho ilustrativo da fila: o que o produto faz, mostrado em vez de descrito. */
const ROWS: Array<{
  number: string
  title: string
  status: string
  fraction: number | null
  tone: 'neutral' | 'warning' | 'danger'
}> = [
  {
    number: 'HD-000214',
    title: 'VPN não conecta após a atualização',
    status: '3h 10min restantes',
    fraction: 0.32,
    tone: 'neutral',
  },
  {
    number: 'HD-000213',
    title: 'Impressora do 2º andar sem toner',
    status: '42min restantes',
    fraction: 0.81,
    tone: 'warning',
  },
  {
    number: 'HD-000209',
    title: 'Acesso ao ERP bloqueado',
    status: 'Vencido há 1h',
    fraction: 1,
    tone: 'danger',
  },
  {
    number: 'HD-000207',
    title: 'Notebook novo para o comercial',
    status: 'Resolvido no prazo',
    fraction: null,
    tone: 'neutral',
  },
]

const TONES = {
  neutral: { track: 'bg-border', fill: 'bg-secondary', text: 'text-secondary' },
  warning: { track: 'bg-warning-soft', fill: 'bg-warning', text: 'text-warning' },
  danger: { track: 'bg-danger-soft', fill: 'bg-danger', text: 'text-danger' },
} as const

export function QueuePreview() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm font-semibold text-text">Fila de atendimento</span>
        <span className="text-xs text-secondary">Prazo de resolução</span>
      </div>
      <ul className="divide-y divide-border">
        {ROWS.map((row) => {
          const tone = TONES[row.tone]
          return (
            <li key={row.number} className="grid grid-cols-[1fr_9rem] items-center gap-6 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-xs text-secondary tabular-nums">{row.number}</p>
                <p className="truncate text-sm font-medium text-text">{row.title}</p>
              </div>
              <div className="space-y-1.5">
                {row.fraction === null ? (
                  <p className="flex items-center gap-1.5 text-xs text-text">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {row.status}
                  </p>
                ) : (
                  <>
                    <p className={cx('text-xs tabular-nums', tone.text)}>{row.status}</p>
                    <span className={cx('block h-1 overflow-hidden rounded-full', tone.track)}>
                      <span
                        className={cx('block h-full rounded-full', tone.fill)}
                        style={{ width: `${row.fraction * 100}%` }}
                      />
                    </span>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
