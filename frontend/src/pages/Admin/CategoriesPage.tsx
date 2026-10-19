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
  useAdminCategories,
  useDeleteCategory,
  useSaveCategory,
  useSLAPolicies,
} from '@/features/admin/hooks/useAdmin'
import type { AdminCategory, SLAPolicy } from '@/features/admin/types'
import { PriorityBadge } from '@/features/tickets/components/TicketBadges'
import { PRIORITY_LABELS } from '@/features/tickets/labels'
import { TICKET_PRIORITIES } from '@/features/tickets/types'
import { getErrorMessage } from '@/services/api/errors'

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(100, 'Máximo de 100 caracteres.'),
  description: z.string().trim().max(255, 'Máximo de 255 caracteres.'),
  default_priority: z.enum(TICKET_PRIORITIES),
  default_sla_policy_id: z.string(),
  is_active: z.boolean(),
})

type FormValues = z.infer<typeof schema>

/** Categorias de chamados (§12, §50): prioridade e SLA padrão de cada uma. */
export function CategoriesPage() {
  const categories = useAdminCategories()
  const policies = useSLAPolicies()
  const remove = useDeleteCategory()
  const { showToast } = useToast()
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminCategory | null>(null)
  const policyName = (id: number | null) =>
    policies.data?.find((policy) => policy.id === id)?.name ?? 'Padrão da prioridade'

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      showToast(`Categoria "${deleting.name}" excluída.`)
      setDeleting(null)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível excluir.'), 'error')
      setDeleting(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <AdminHeader
        title="Categorias"
        description="Tipos de chamado, com a prioridade e o SLA aplicados por padrão."
        action={
          <Button
            icon={<Plus aria-hidden="true" className="size-4" />}
            onClick={() => setEditing('new')}
          >
            Nova categoria
          </Button>
        }
      />

      {categories.isPending ? (
        <SkeletonText lines={6} />
      ) : categories.isError ? (
        <ErrorState
          title="Não foi possível carregar as categorias."
          description={getErrorMessage(categories.error)}
          onRetry={() => void categories.refetch()}
          isRetrying={categories.isFetching}
        />
      ) : categories.data.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria cadastrada."
          description="Crie categorias como Rede, E-mail e VPN para classificar os chamados."
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Categorias</caption>
            <thead className="border-b border-border text-xs text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nome
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Prioridade padrão
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  SLA
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Situação
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.data.map((category) => (
                <tr key={category.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{category.name}</p>
                    {category.description ? (
                      <p className="text-xs text-secondary">{category.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={category.default_priority} />
                  </td>
                  <td className="px-4 py-3 text-text">
                    {policyName(category.default_sla_policy_id)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={category.is_active ? 'success' : 'neutral'}>
                      {category.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil aria-hidden="true" className="size-4" />}
                        onClick={() => setEditing(category)}
                      >
                        <span className="sr-only">Editar {category.name}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 aria-hidden="true" className="size-4" />}
                        onClick={() => setDeleting(category)}
                      >
                        <span className="sr-only">Excluir {category.name}</span>
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
        <CategoryForm
          category={editing === 'new' ? null : editing}
          policies={policies.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Excluir categoria"
        description="Só é possível excluir categorias sem chamados ou artigos. Se estiver em uso, desative-a."
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

function CategoryForm({
  category,
  policies,
  onClose,
}: {
  category: AdminCategory | null
  policies: SLAPolicy[]
  onClose: () => void
}) {
  const save = useSaveCategory()
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      default_priority: category?.default_priority ?? 'MEDIUM',
      default_sla_policy_id: category?.default_sla_policy_id
        ? String(category.default_sla_policy_id)
        : '',
      is_active: category?.is_active ?? true,
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await save.mutateAsync({
        id: category?.id,
        data: {
          ...values,
          description: values.description || null,
          default_sla_policy_id: values.default_sla_policy_id
            ? Number(values.default_sla_policy_id)
            : null,
        },
      })
      showToast(category ? 'Categoria atualizada.' : 'Categoria criada.')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível salvar.'), 'error')
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={category ? 'Editar categoria' : 'Nova categoria'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="category-form" isLoading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="category-form"
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
          label="Prioridade padrão"
          options={TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
          {...register('default_priority')}
        />
        <Select
          label="Política de SLA"
          placeholder="Padrão da prioridade"
          hint="Sem política própria, vale a política da prioridade do chamado."
          options={policies
            .filter((policy) => policy.is_active || policy.id === category?.default_sla_policy_id)
            .map((policy) => ({ value: String(policy.id), label: policy.name }))}
          {...register('default_sla_policy_id')}
        />
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register('is_active')}
          />
          Ativa (disponível para novos chamados)
        </label>
      </form>
    </Modal>
  )
}
