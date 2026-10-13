import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { AdminHeader } from '@/features/admin/components/AdminHeader'
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog'
import {
  useDeleteSLAPolicy,
  useSaveSLAPolicy,
  useSLAPolicies,
} from '@/features/admin/hooks/useAdmin'
import type { SLAPolicy } from '@/features/admin/types'
import { PRIORITY_LABELS } from '@/features/tickets/labels'
import type { TicketPriority } from '@/features/tickets/types'
import { getErrorMessage } from '@/services/api/errors'
import { formatMinutes } from '@/utils/format'

const PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[]
const MAX_MINUTES = 60 * 24 * 365

const minutes = z.coerce
  .number({ error: 'Informe os minutos.' })
  .int('Use minutos inteiros.')
  .positive('Deve ser maior que zero.')
  .max(MAX_MINUTES, 'Máximo de 1 ano.')

const schema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(100, 'Máximo de 100 caracteres.'),
    description: z.string().trim().max(255, 'Máximo de 255 caracteres.'),
    priority: z.string(),
    response_time_minutes: minutes,
    resolution_time_minutes: minutes,
    is_active: z.boolean(),
  })
  .refine((data) => data.resolution_time_minutes >= data.response_time_minutes, {
    path: ['resolution_time_minutes'],
    message: 'A resolução não pode ser menor que a primeira resposta.',
  })

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

/** Políticas de SLA (§21, §50): prazos de primeira resposta e de resolução. */
export function SLAPage() {
  const policies = useSLAPolicies()
  const remove = useDeleteSLAPolicy()
  const { showToast } = useToast()
  const [editing, setEditing] = useState<SLAPolicy | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SLAPolicy | null>(null)

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      showToast(`Política "${deleting.name}" excluída.`)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível excluir.'), 'error')
    }
    setDeleting(null)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <AdminHeader
        title="SLA"
        description="Prazos de atendimento. Políticas com prioridade valem para chamados dessa prioridade sem SLA na categoria."
        action={
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setEditing('new')}>
            Nova política
          </Button>
        }
      />

      {policies.isPending ? (
        <SkeletonText lines={6} />
      ) : policies.isError ? (
        <ErrorState
          title="Não foi possível carregar as políticas de SLA."
          description={getErrorMessage(policies.error)}
          onRetry={() => void policies.refetch()}
          isRetrying={policies.isFetching}
        />
      ) : policies.data.length === 0 ? (
        <EmptyState
          title="Nenhuma política de SLA."
          description="Sem SLA, os chamados não têm prazo de atendimento."
        />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Políticas de SLA</caption>
            <thead className="border-b border-border text-xs text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                <th scope="col" className="px-4 py-3 font-medium">Aplica-se a</th>
                <th scope="col" className="px-4 py-3 font-medium">1ª resposta</th>
                <th scope="col" className="px-4 py-3 font-medium">Resolução</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.data.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-4 py-3 font-medium text-text">{policy.name}</td>
                  <td className="px-4 py-3 text-text">
                    {policy.priority
                      ? `Prioridade ${PRIORITY_LABELS[policy.priority].toLowerCase()}`
                      : 'Categorias vinculadas'}
                  </td>
                  <td className="px-4 py-3 text-text tabular-nums">
                    {formatMinutes(policy.response_time_minutes)}
                  </td>
                  <td className="px-4 py-3 text-text tabular-nums">
                    {formatMinutes(policy.resolution_time_minutes)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={policy.is_active ? 'success' : 'neutral'}>
                      {policy.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil aria-hidden="true" className="size-4" />}
                        onClick={() => setEditing(policy)}
                      >
                        <span className="sr-only">Editar {policy.name}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 aria-hidden="true" className="size-4" />}
                        onClick={() => setDeleting(policy)}
                      >
                        <span className="sr-only">Excluir {policy.name}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null ? (
        <PolicyForm policy={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Excluir política de SLA"
        description="Só é possível excluir políticas sem chamados ou categorias vinculados. Se estiver em uso, desative-a."
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

function PolicyForm({ policy, onClose }: { policy: SLAPolicy | null; onClose: () => void }) {
  const save = useSaveSLAPolicy()
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: policy?.name ?? '',
      description: policy?.description ?? '',
      priority: policy?.priority ?? '',
      response_time_minutes: policy?.response_time_minutes ?? 60,
      resolution_time_minutes: policy?.resolution_time_minutes ?? 480,
      is_active: policy?.is_active ?? true,
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await save.mutateAsync({
        id: policy?.id,
        data: {
          ...values,
          description: values.description || null,
          priority: (values.priority || null) as TicketPriority | null,
        },
      })
      showToast(policy ? 'Política atualizada.' : 'Política criada.')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível salvar.'), 'error')
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={policy ? 'Editar política de SLA' : 'Nova política de SLA'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="sla-form" isLoading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="sla-form"
        noValidate
        className="space-y-4"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        <Input label="Nome" error={errors.name?.message} {...register('name')} />
        <Input
          label="Descrição"
          optional
          error={errors.description?.message}
          {...register('description')}
        />
        <Select
          label="Prioridade"
          placeholder="Nenhuma (usar só via categoria)"
          hint="Com prioridade, vira o padrão para chamados dessa prioridade."
          options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
          {...register('priority')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="1ª resposta (minutos)"
            type="number"
            inputMode="numeric"
            min={1}
            error={errors.response_time_minutes?.message}
            {...register('response_time_minutes')}
          />
          <Input
            label="Resolução (minutos)"
            type="number"
            inputMode="numeric"
            min={1}
            error={errors.resolution_time_minutes?.message}
            {...register('resolution_time_minutes')}
          />
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register('is_active')}
          />
          Ativa
        </label>
      </form>
    </Modal>
  )
}
