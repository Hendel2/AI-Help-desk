import { useSearchParams } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { AdminHeader } from '@/features/admin/components/AdminHeader'
import { useAuditLog } from '@/features/admin/hooks/useAdmin'
import { AUDIT_ACTION_LABELS, ENTITY_LABELS } from '@/features/admin/labels'
import type { AuditAction, AuditEntry } from '@/features/admin/types'
import { ROLE_LABELS } from '@/features/auth/roleLabels'
import type { RoleName } from '@/features/auth/types'
import { getErrorMessage } from '@/services/api/errors'
import { formatDateTime } from '@/utils/format'

const ACTION_OPTIONS = (Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((value) => ({
  value,
  label: AUDIT_ACTION_LABELS[value],
}))

const OPERATION_LABELS: Record<string, string> = {
  create: 'criação',
  update: 'alteração',
  delete: 'exclusão',
}

/** Resumo legível dos metadados (que nunca contêm segredos). */
function describe(entry: AuditEntry): string {
  const meta = entry.metadata ?? {}
  if (entry.action === 'PERMISSION_CHANGED' && typeof meta.from === 'string') {
    const label = (role: unknown) => ROLE_LABELS[role as RoleName] ?? String(role)
    return `${label(meta.from)} → ${label(meta.to)}`
  }
  if (typeof meta.operation === 'string') return OPERATION_LABELS[meta.operation] ?? meta.operation
  if (Array.isArray(meta.fields)) return `Campos: ${meta.fields.join(', ')}`
  return ''
}

/** Trilha de auditoria da empresa (§50, §76). Somente leitura. */
export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = {
    page: Number(searchParams.get('pagina')) || 1,
    action: (searchParams.get('acao') ?? '') as AuditAction | '',
  }
  const audit = useAuditLog(params)

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'pagina') next.delete('pagina')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <AdminHeader
        title="Auditoria"
        description="Registro das ações administrativas e de segurança da empresa."
      />
      <Select
        label="Ação"
        placeholder="Todas as ações"
        options={ACTION_OPTIONS}
        value={params.action}
        onChange={(event) => update('acao', event.target.value)}
        containerClassName="max-w-xs"
      />

      {audit.isPending ? (
        <SkeletonText lines={8} />
      ) : audit.isError ? (
        <ErrorState
          title="Não foi possível carregar a auditoria."
          description={getErrorMessage(audit.error)}
          onRetry={() => void audit.refetch()}
          isRetrying={audit.isFetching}
        />
      ) : audit.data.items.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado." description="Ajuste o filtro de ação." />
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Registros de auditoria</caption>
              <thead className="border-b border-border text-xs text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Data</th>
                  <th scope="col" className="px-4 py-3 font-medium">Responsável</th>
                  <th scope="col" className="px-4 py-3 font-medium">Ação</th>
                  <th scope="col" className="px-4 py-3 font-medium">Alvo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Detalhes</th>
                  <th scope="col" className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-text tabular-nums">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 text-text">{entry.user?.name ?? 'Sistema'}</td>
                    <td className="px-4 py-3 text-text">{AUDIT_ACTION_LABELS[entry.action]}</td>
                    <td className="px-4 py-3 text-text">
                      {ENTITY_LABELS[entry.entity] ?? entry.entity}
                      {entry.entity_id ? ` #${entry.entity_id}` : ''}
                    </td>
                    <td className="px-4 py-3 text-secondary">{describe(entry) || '—'}</td>
                    <td className="px-4 py-3 text-secondary tabular-nums">
                      {entry.ip_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={audit.data.page}
            pages={audit.data.pages}
            total={audit.data.total}
            onPageChange={(page) => update('pagina', String(page))}
          />
        </>
      )}
    </div>
  )
}
