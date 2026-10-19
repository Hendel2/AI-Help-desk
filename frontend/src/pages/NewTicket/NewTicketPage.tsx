import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Check, FileText, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { FieldPath } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { PageHeader } from '@/components/PageHeader'
import { FileUpload } from '@/components/FileUpload'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cx } from '@/components/ui/styles'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/useToast'
import { useClassifyTicket } from '@/features/ai/hooks/useClassify'
import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  formatFileSize,
  MAX_ATTACHMENT_MB,
} from '@/features/tickets/attachments'
import { useAttachFiles, useCategories, useCreateTicket } from '@/features/tickets/hooks/useTickets'
import { PRIORITY_LABELS } from '@/features/tickets/labels'
import { TICKET_PRIORITIES } from '@/features/tickets/types'
import type { TicketPriority } from '@/features/tickets/types'
import { getErrorMessage } from '@/services/api/errors'

/** Mesmas regras do `TicketCreate` no backend. */
const ticketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Use pelo menos 5 caracteres no título.')
    .max(200, 'O título deve ter no máximo 200 caracteres.'),
  description: z
    .string()
    .trim()
    .min(10, 'Descreva o problema com pelo menos 10 caracteres.')
    .max(20_000, 'A descrição deve ter no máximo 20.000 caracteres.'),
  categoryId: z.string(),
  priority: z.union([z.enum(TICKET_PRIORITIES), z.literal('')]),
})

type TicketFormValues = z.infer<typeof ticketSchema>

interface Step {
  title: string
  description: string
  fields: Array<FieldPath<TicketFormValues>>
}

const STEPS: Step[] = [
  {
    title: 'Descreva o problema',
    description: 'Conte o que está acontecendo, desde quando e o que você já tentou.',
    fields: ['title', 'description'],
  },
  {
    title: 'Classificação',
    description: 'Escolha a categoria. A prioridade sugerida vem da categoria e pode ser ajustada.',
    fields: ['categoryId', 'priority'],
  },
  {
    title: 'Anexos',
    description: 'Opcional: anexe prints ou documentos que ajudem a entender o problema.',
    fields: [],
  },
  {
    title: 'Revisão',
    description: 'Confira os dados antes de enviar.',
    fields: [],
  },
]

/** Abertura de chamado em etapas, sem formulário gigante (§47). */
export function NewTicketPage() {
  const [stepIndex, setStepIndex] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const categories = useCategories()
  const createTicket = useCreateTicket()
  const attachFiles = useAttachFiles()
  const classify = useClassifyTicket()
  const suggestion = classify.data
  const navigate = useNavigate()
  const { showToast } = useToast()

  const {
    register,
    handleSubmit,
    trigger,
    control,
    setValue,
    formState: { errors },
  } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { title: '', description: '', categoryId: '', priority: '' },
  })

  // useWatch (e não watch()) é compatível com a memoização do React Compiler.
  const values = useWatch({ control })
  const step = STEPS[stepIndex]!
  const isLastStep = stepIndex === STEPS.length - 1
  const selectedCategory = categories.data?.find(
    (category) => String(category.id) === values.categoryId,
  )
  // A prioridade da IA vale enquanto a categoria escolhida for a sugerida (ou nenhuma).
  const aiPriorityApplies =
    suggestion !== undefined &&
    (!values.categoryId || String(suggestion.category_id) === values.categoryId)
  const suggestedPriority: TicketPriority = aiPriorityApplies
    ? suggestion.priority
    : (selectedCategory?.default_priority ?? 'MEDIUM')
  const effectivePriority: TicketPriority = values.priority || suggestedPriority

  const goNext = async () => {
    if (!(await trigger(step.fields))) return
    if (stepIndex === 0) {
      // A IA sugere categoria e prioridade a partir do relato (§47); o usuário pode mudar.
      classify.mutate(
        `${values.title ?? ''}

${values.description ?? ''}`,
        {
          onSuccess: (result) => {
            if (result.category_id !== null && !values.categoryId) {
              setValue('categoryId', String(result.category_id))
            }
          },
        },
      )
    }
    setStepIndex((index) => index + 1)
  }

  const onSubmit = async (data: TicketFormValues) => {
    try {
      const ticket = await createTicket.mutateAsync({
        title: data.title,
        description: data.description,
        category_id: data.categoryId ? Number(data.categoryId) : null,
        // Envia a prioridade efetiva: escolhida pelo usuário ou sugerida.
        priority: data.priority || effectivePriority,
      })
      const failed = files.length
        ? await attachFiles.mutateAsync({ ticketId: ticket.id, files })
        : []
      showToast(`Chamado ${ticket.ticket_number} aberto com sucesso.`)
      if (failed.length > 0) {
        // O chamado já existe: avisa e deixa anexar de novo pela tela de detalhe.
        showToast(
          `Não foi possível anexar: ${failed.map((file) => file.name).join(', ')}. Tente novamente no chamado.`,
          'error',
        )
      }
      void navigate(`/chamados/${ticket.id}`, { replace: true })
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível abrir o chamado.'), 'error')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <ButtonLink
        to="/chamados/meus"
        variant="ghost"
        size="sm"
        icon={<ArrowLeft aria-hidden="true" className="size-4" />}
        className="-ml-3"
      >
        Voltar
      </ButtonLink>

      <PageHeader title="Novo chamado" description="Leva menos de um minuto." />

      <ol className="flex gap-2" aria-label="Etapas">
        {STEPS.map((item, index) => {
          const done = index < stepIndex
          const current = index === stepIndex
          return (
            <li
              key={item.title}
              aria-current={current ? 'step' : undefined}
              className="flex flex-1 flex-col gap-2"
            >
              <span
                className={cx('h-1 rounded-full', done || current ? 'bg-primary' : 'bg-border')}
              />
              <span
                className={cx(
                  'flex items-center gap-1 text-xs',
                  current ? 'font-medium text-text' : 'text-secondary',
                )}
              >
                {done ? <Check aria-hidden="true" className="size-3 text-primary" /> : null}
                <span className="hidden sm:inline">{item.title}</span>
                <span className="sm:hidden">{index + 1}</span>
                {done ? <span className="sr-only"> (concluída)</span> : null}
              </span>
            </li>
          )
        })}
      </ol>

      <form
        noValidate
        className="space-y-6 rounded-xl border border-border bg-surface p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (isLastStep) void handleSubmit(onSubmit)(event)
          else void goNext()
        }}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-text">
            <span className="sr-only">
              Etapa {stepIndex + 1} de {STEPS.length}:{' '}
            </span>
            {step.title}
          </h2>
          <p className="text-sm text-secondary">{step.description}</p>
        </div>

        {stepIndex === 0 ? (
          <div className="space-y-4">
            <Input
              label="Título"
              placeholder="Ex.: VPN não conecta"
              error={errors.title?.message}
              {...register('title')}
            />
            <Textarea
              label="Descrição"
              rows={6}
              placeholder="Ex.: desde as 08:30 a VPN mostra 'falha de autenticação'. Já reiniciei o notebook."
              error={errors.description?.message}
              {...register('description')}
            />
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="space-y-4">
            <AISuggestionNote
              isLoading={classify.isPending}
              categoryName={suggestion?.category_name ?? null}
              priority={suggestion?.priority ?? null}
              source={suggestion?.source ?? null}
            />
            <Select
              label="Categoria"
              optional
              placeholder={categories.isPending ? 'Carregando categorias…' : 'Não sei / outra'}
              options={(categories.data ?? []).map((category) => ({
                value: String(category.id),
                label: category.name,
              }))}
              error={errors.categoryId?.message}
              {...register('categoryId', {
                // Ao trocar de categoria, volta a valer a prioridade sugerida por ela.
                onChange: () => setValue('priority', ''),
              })}
            />
            <Select
              label="Prioridade"
              hint={`Sugerida: ${PRIORITY_LABELS[suggestedPriority]}. Altere se o impacto for diferente.`}
              aria-busy={classify.isPending || undefined}
              placeholder={`Usar a sugerida (${PRIORITY_LABELS[suggestedPriority]})`}
              options={TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
              error={errors.priority?.message}
              {...register('priority')}
            />
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="space-y-4">
            <FileUpload
              label="Escolher arquivos"
              multiple
              accept={ATTACHMENT_ACCEPT}
              hint={`Imagens, PDF, Office ou texto, até ${MAX_ATTACHMENT_MB} MB cada.`}
              onFilesSelected={(selected) => {
                const problems = selected.map(checkAttachment).filter((problem) => problem !== null)
                setFileErrors(problems)
                setFiles((current) => [
                  ...current,
                  ...selected.filter((file) => checkAttachment(file) === null),
                ])
              }}
            />
            {fileErrors.length > 0 ? (
              <ul role="alert" className="space-y-1 text-sm text-danger">
                {fileErrors.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
            {files.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2">
                    <FileText aria-hidden="true" className="size-4 shrink-0 text-secondary" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{file.name}</span>
                    <span className="text-xs text-secondary">{formatFileSize(file.size)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X aria-hidden="true" className="size-4" />}
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    >
                      <span className="sr-only">Remover {file.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-secondary">Nenhum arquivo selecionado.</p>
            )}
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <dl className="divide-y divide-border rounded-lg border border-border text-sm">
            <ReviewRow label="Título" value={values.title ?? ''} />
            <ReviewRow label="Descrição" value={values.description ?? ''} multiline />
            <ReviewRow label="Categoria" value={selectedCategory?.name ?? 'Sem categoria'} />
            <ReviewRow label="Prioridade" value={PRIORITY_LABELS[effectivePriority]} />
            <ReviewRow
              label="Anexos"
              value={files.length ? files.map((file) => file.name).join(', ') : 'Nenhum'}
            />
          </dl>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
          {stepIndex > 0 ? (
            <Button variant="secondary" onClick={() => setStepIndex((index) => index - 1)}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" isLoading={createTicket.isPending || attachFiles.isPending}>
            {isLastStep ? 'Abrir chamado' : 'Continuar'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function ReviewRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="text-secondary sm:w-28 sm:shrink-0">{label}</dt>
      <dd className={cx('text-text', multiline && 'break-words whitespace-pre-wrap')}>{value}</dd>
    </div>
  )
}

interface AISuggestionNoteProps {
  isLoading: boolean
  categoryName: string | null
  priority: TicketPriority | null
  source: 'llm' | 'heuristic' | null
}

/** Explica de onde veio a sugestão — o usuário sabe o que foi preenchido por ele e pela IA. */
function AISuggestionNote({ isLoading, categoryName, priority, source }: AISuggestionNoteProps) {
  if (!isLoading && priority === null) return null
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-sm text-text"
    >
      <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      {isLoading ? (
        <span>Analisando o seu relato para sugerir a classificação…</span>
      ) : (
        <span>
          {source === 'llm' ? 'Sugestão da IA' : 'Sugestão automática'}:{' '}
          {categoryName ? (
            <>
              categoria <strong className="font-medium">{categoryName}</strong>,{' '}
            </>
          ) : null}
          prioridade{' '}
          <strong className="font-medium">{priority ? PRIORITY_LABELS[priority] : ''}</strong>. Você
          pode alterar.
        </span>
      )}
    </p>
  )
}
