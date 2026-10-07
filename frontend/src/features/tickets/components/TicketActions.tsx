import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/useToast'
import { getErrorMessage } from '@/services/api/errors'

import { useTicketActions } from '../hooks/useTickets'
import { PRIORITY_LABELS, STATUS_ACTION_LABELS, STATUS_LABELS } from '../labels'
import { TICKET_PRIORITIES } from '../types'
import type { Ticket, TicketPriority, TicketStatus } from '../types'

interface TicketActionsProps {
  ticket: Ticket
  isStaff: boolean
}

/** Status aplicados diretamente, sem formulário. */
const DIRECT_STATUSES: TicketStatus[] = ['IN_PROGRESS', 'WAITING_USER', 'TRIAGE']

const solutionSchema = z.object({
  solution: z
    .string()
    .trim()
    .min(1, 'Descreva a solução aplicada.')
    .max(10_000, 'A solução deve ter no máximo 10.000 caracteres.'),
})

type SolutionValues = z.infer<typeof solutionSchema>

/**
 * Ações do chamado. Só aparecem as transições que o backend informou como
 * permitidas para o usuário atual (`allowed_transitions`) — a validação real
 * continua no servidor.
 */
export function TicketActions({ ticket, isStaff }: TicketActionsProps) {
  const actions = useTicketActions(ticket.id)
  const { showToast } = useToast()
  const [dialog, setDialog] = useState<'resolve' | 'cancel' | null>(null)

  const allowed = new Set(ticket.allowed_transitions)
  const isFinished = ticket.status === 'CLOSED' || ticket.status === 'CANCELLED'
  const canTakeOver = isStaff && !isFinished && ticket.technician === null
  const busy =
    actions.assign.isPending ||
    actions.changeStatus.isPending ||
    actions.close.isPending ||
    actions.update.isPending

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      showToast(success)
      return true
    } catch (error) {
      showToast(getErrorMessage(error), 'error')
      return false
    }
  }

  const directStatuses = DIRECT_STATUSES.filter((status) => allowed.has(status))
  const hasActions =
    canTakeOver ||
    directStatuses.length > 0 ||
    allowed.has('RESOLVED') ||
    allowed.has('CLOSED') ||
    allowed.has('CANCELLED') ||
    (isStaff && !isFinished)

  if (!hasActions) return null

  return (
    <Card title="Ações">
      <div className="flex flex-col gap-2">
        {canTakeOver ? (
          <Button
            disabled={busy}
            isLoading={actions.assign.isPending}
            onClick={() => void run(() => actions.assign.mutateAsync(undefined), 'Você assumiu o chamado.')}
          >
            Assumir chamado
          </Button>
        ) : null}

        {allowed.has('RESOLVED') ? (
          <Button disabled={busy} onClick={() => setDialog('resolve')}>
            {STATUS_ACTION_LABELS.RESOLVED}
          </Button>
        ) : null}

        {directStatuses.map((status) => (
          <Button
            key={status}
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => actions.changeStatus.mutateAsync({ status }),
                `Status alterado para "${STATUS_LABELS[status]}".`,
              )
            }
          >
            {status === 'IN_PROGRESS' && ticket.status === 'RESOLVED'
              ? 'Reabrir chamado'
              : STATUS_ACTION_LABELS[status]}
          </Button>
        ))}

        {allowed.has('CLOSED') ? (
          <Button
            variant="secondary"
            disabled={busy}
            isLoading={actions.close.isPending}
            onClick={() => void run(() => actions.close.mutateAsync(undefined), 'Chamado fechado.')}
          >
            {isStaff ? STATUS_ACTION_LABELS.CLOSED : 'Confirmar solução e fechar'}
          </Button>
        ) : null}

        {allowed.has('CANCELLED') ? (
          <Button variant="ghost" disabled={busy} onClick={() => setDialog('cancel')}>
            {STATUS_ACTION_LABELS.CANCELLED}
          </Button>
        ) : null}

        {isStaff && !isFinished ? (
          <Select
            label="Prioridade"
            containerClassName="mt-2"
            value={ticket.priority}
            disabled={busy}
            options={TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
            onChange={(event) => {
              const priority = event.target.value as TicketPriority
              void run(
                () => actions.update.mutateAsync({ priority }),
                `Prioridade alterada para "${PRIORITY_LABELS[priority]}".`,
              )
            }}
          />
        ) : null}
      </div>

      <ResolveDialog
        isOpen={dialog === 'resolve'}
        isSubmitting={actions.resolve.isPending}
        onClose={() => setDialog(null)}
        onSubmit={async (solution) => {
          const ok = await run(() => actions.resolve.mutateAsync(solution), 'Chamado resolvido.')
          if (ok) setDialog(null)
        }}
      />

      <Modal
        isOpen={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Cancelar chamado"
        description="O chamado será encerrado sem solução e não poderá ser reaberto."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              isLoading={actions.changeStatus.isPending}
              onClick={() =>
                void run(
                  () => actions.changeStatus.mutateAsync({ status: 'CANCELLED' }),
                  'Chamado cancelado.',
                ).then((ok) => {
                  if (ok) setDialog(null)
                })
              }
            >
              Cancelar chamado
            </Button>
          </>
        }
      />
    </Card>
  )
}

interface ResolveDialogProps {
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (solution: string) => Promise<void>
}

/** A solução vira um comentário público do chamado (backend: `POST /resolve`). */
function ResolveDialog({ isOpen, isSubmitting, onClose, onSubmit }: ResolveDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SolutionValues>({
    resolver: zodResolver(solutionSchema),
    defaultValues: { solution: '' },
  })

  const close = () => {
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Resolver chamado"
      description="Descreva a solução. Ela será enviada ao solicitante como resposta."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit(async ({ solution }) => {
            await onSubmit(solution)
            reset()
          })(event)
        }}
      >
        <Textarea label="Solução" rows={5} error={errors.solution?.message} {...register('solution')} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close}>
            Voltar
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Resolver chamado
          </Button>
        </div>
      </form>
    </Modal>
  )
}
