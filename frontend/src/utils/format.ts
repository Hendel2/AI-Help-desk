/** Formatação de datas e durações em pt-BR (fuso do navegador). */

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
})

const relativeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

export function formatShortDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

/** "há 5 minutos", "ontem", "há 3 dias". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return relativeFormatter.format(Math.trunc(seconds), 'second')
  if (abs < 3600) return relativeFormatter.format(Math.trunc(seconds / 60), 'minute')
  if (abs < 86_400) return relativeFormatter.format(Math.trunc(seconds / 3600), 'hour')
  if (abs < 2_592_000) return relativeFormatter.format(Math.trunc(seconds / 86_400), 'day')
  return formatShortDate(iso)
}

/**
 * Duração compacta para o SLA (§42): "01:32" (até 24h), "2d 4h" acima disso.
 * Usa o valor absoluto — quem chama decide se é "restante" ou "atraso".
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.abs(Math.trunc(totalSeconds))
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
