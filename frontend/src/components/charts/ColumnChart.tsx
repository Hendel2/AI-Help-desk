import { useId, useState } from 'react'

import { cx } from '@/components/ui/styles'

export interface ColumnDatum {
  /** Rótulo curto do eixo X (ex.: "07/10"). */
  label: string
  /** Rótulo completo usado no tooltip e na tabela (ex.: "07/10/2026"). */
  fullLabel: string
  /** `null` = sem dado no período (coluna vazia, diferente de zero). */
  value: number | null
}

interface ColumnChartProps {
  data: ColumnDatum[]
  /** Descrição do que a série mede (nome acessível e cabeçalho da tabela). */
  valueLabel: string
  formatValue?: (value: number) => string
  /** Teto fixo do eixo (ex.: 100 para percentuais). */
  maxValue?: number
  height?: number
  className?: string
}

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10
  return step * magnitude
}

/**
 * Colunas de uma série ao longo do tempo. Specs da skill dataviz: coluna fina
 * (≤ 24px), 4px arredondado só no topo, 2px de respiro entre colunas, grade
 * recessiva, tooltip ao passar o mouse e tabela com os dados para teclado e
 * leitores de tela (o gráfico em si é decorativo para tecnologias assistivas).
 */
export function ColumnChart({
  data,
  valueLabel,
  formatValue = String,
  maxValue,
  height = 160,
  className,
}: ColumnChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const tableId = useId()
  const top = maxValue ?? niceMax(Math.max(...data.map((datum) => datum.value ?? 0), 0))
  const active = hovered === null ? null : data[hovered]
  const labelStep = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div className={cx('space-y-3', className)}>
      <div className="flex gap-2">
        {/* Eixo Y: apenas teto e zero, números limpos. */}
        <div
          aria-hidden="true"
          className="flex flex-col justify-between text-right text-xs text-secondary tabular-nums"
          style={{ height }}
        >
          <span>{formatValue(top)}</span>
          <span>{formatValue(0)}</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden="true"
            className="relative flex items-end gap-0.5 border-b border-border"
            style={{ height }}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Grade recessiva: uma linha no meio. */}
            <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-border" />
            {data.map((datum, index) => {
              const pct = datum.value === null ? 0 : Math.min(100, (datum.value / top) * 100)
              return (
                // Alvo de hover = a faixa inteira, maior que a coluna.
                <div
                  key={datum.fullLabel}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHovered(index)}
                >
                  <div
                    className={cx(
                      'w-full max-w-6 rounded-t transition-colors',
                      hovered === null || hovered === index ? 'bg-primary' : 'bg-primary/40',
                    )}
                    style={{
                      height: `${pct}%`,
                      minHeight: datum.value ? '2px' : 0,
                    }}
                  />
                </div>
              )
            })}
          </div>

          {active ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface-raised px-2 py-1 text-xs whitespace-nowrap text-text shadow-overlay"
            >
              <span className="text-secondary">{active.fullLabel}: </span>
              <span className="font-medium tabular-nums">
                {active.value === null ? 'sem dados' : formatValue(active.value)}
              </span>
            </div>
          ) : null}

          <div aria-hidden="true" className="mt-1 flex gap-0.5 text-xs text-secondary">
            {data.map((datum, index) => (
              <span key={datum.fullLabel} className="flex-1 text-center">
                {index % labelStep === 0 || index === data.length - 1 ? datum.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-secondary hover:text-text">Ver dados em tabela</summary>
        <table id={tableId} className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">{valueLabel}</caption>
          <thead className="text-xs text-secondary">
            <tr>
              <th scope="col" className="py-1 font-medium">Período</th>
              <th scope="col" className="py-1 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((datum) => (
              <tr key={datum.fullLabel}>
                <td className="py-1 text-text">{datum.fullLabel}</td>
                <td className="py-1 text-right text-text tabular-nums">
                  {datum.value === null ? '—' : formatValue(datum.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
