import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { AdminHeader } from '@/features/admin/components/AdminHeader'
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog'
import {
  useDeleteDepartment,
  useDepartments,
  useSaveDepartment,
} from '@/features/admin/hooks/useAdmin'
import type { Department } from '@/features/admin/types'
import { getErrorMessage } from '@/services/api/errors'

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(100, 'Máximo de 100 caracteres.'),
  description: z.string().trim().max(255, 'Máximo de 255 caracteres.'),
})

type FormValues = z.infer<typeof schema>

/** Departamentos da empresa (§11, §50). */
export function DepartmentsPage() {
  const departments = useDepartments()
  const remove = useDeleteDepartment()
  const { showToast } = useToast()
  const [editing, setEditing] = useState<Department | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      showToast(`Departamento "${deleting.name}" excluído.`)
      setDeleting(null)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível excluir.'), 'error')
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <AdminHeader
        title="Departamentos"
        description="Áreas da empresa às quais os usuários pertencem."
        action={
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setEditing('new')}>
            Novo departamento
          </Button>
        }
      />

      {departments.isPending ? (
        <SkeletonText lines={5} />
      ) : departments.isError ? (
        <ErrorState
          title="Não foi possível carregar os departamentos."
          description={getErrorMessage(departments.error)}
          onRetry={() => void departments.refetch()}
          isRetrying={departments.isFetching}
        />
      ) : departments.data.length === 0 ? (
        <EmptyState
          title="Nenhum departamento cadastrado."
          description="Crie departamentos como TI, Financeiro e RH para organizar os usuários."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {departments.data.map((department) => (
            <li key={department.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text">{department.name}</p>
                <p className="truncate text-sm text-secondary">
                  {department.description ?? 'Sem descrição'} ·{' '}
                  {department.user_count === 1 ? '1 usuário' : `${department.user_count} usuários`}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil aria-hidden="true" className="size-4" />}
                onClick={() => setEditing(department)}
              >
                <span className="sr-only">Editar {department.name}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 aria-hidden="true" className="size-4" />}
                onClick={() => setDeleting(department)}
              >
                <span className="sr-only">Excluir {department.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null ? (
        <DepartmentForm
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Excluir departamento"
        description={`Os usuários de "${deleting?.name ?? ''}" ficarão sem departamento.`}
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

function DepartmentForm({
  department,
  onClose,
}: {
  department: Department | null
  onClose: () => void
}) {
  const save = useSaveDepartment()
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: department?.name ?? '', description: department?.description ?? '' },
  })

  const onSubmit = async ({ name, description }: FormValues) => {
    try {
      await save.mutateAsync({
        id: department?.id,
        data: { name, description: description || null },
      })
      showToast(department ? 'Departamento atualizado.' : 'Departamento criado.')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível salvar.'), 'error')
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={department ? 'Editar departamento' : 'Novo departamento'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="department-form" isLoading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="department-form"
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
      </form>
    </Modal>
  )
}
