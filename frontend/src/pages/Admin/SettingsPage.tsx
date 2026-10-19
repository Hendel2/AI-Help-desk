import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { AdminHeader } from '@/features/admin/components/AdminHeader'
import { useAISettings, useCompany, useUpdateCompany } from '@/features/admin/hooks/useAdmin'
import type { AISettings, Company } from '@/features/admin/types'
import { getErrorMessage } from '@/services/api/errors'
import { formatPercent } from '@/utils/format'

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
  cnpj: z
    .string()
    .trim()
    .refine((value) => !value || value.replace(/\D/g, '').length === 14, 'O CNPJ tem 14 dígitos.'),
  email: z.union([z.literal(''), z.email('Informe um e-mail válido.')]),
  phone: z.string().trim().max(20, 'Máximo de 20 caracteres.'),
})

type FormValues = z.infer<typeof schema>

/** Configurações (§50): dados da empresa e situação da IA. */
export function SettingsPage() {
  const company = useCompany()
  const ai = useAISettings()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <AdminHeader title="Configurações" description="Dados da empresa e configuração da IA." />

      <Card title="Empresa">
        {company.isPending ? (
          <SkeletonText lines={4} />
        ) : company.isError ? (
          <ErrorState
            title="Não foi possível carregar a empresa."
            description={getErrorMessage(company.error)}
            onRetry={() => void company.refetch()}
            className="py-4"
          />
        ) : (
          <CompanyForm company={company.data} />
        )}
      </Card>

      <Card title="Inteligência artificial">
        {ai.isPending ? (
          <SkeletonText lines={4} />
        ) : ai.isError ? (
          <ErrorState
            title="Não foi possível carregar a configuração da IA."
            description={getErrorMessage(ai.error)}
            onRetry={() => void ai.refetch()}
            className="py-4"
          />
        ) : (
          <AISummary settings={ai.data} />
        )}
      </Card>
    </div>
  )
}

function CompanyForm({ company }: { company: Company }) {
  const update = useUpdateCompany()
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: company.name,
      cnpj: company.cnpj ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      const saved = await update.mutateAsync({
        name: values.name,
        cnpj: values.cnpj || null,
        email: values.email || null,
        phone: values.phone || null,
      })
      reset({
        name: saved.name,
        cnpj: saved.cnpj ?? '',
        email: saved.email ?? '',
        phone: saved.phone ?? '',
      })
      showToast('Dados da empresa atualizados.')
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível salvar.'), 'error')
    }
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <Input label="Nome da empresa" error={errors.name?.message} {...register('name')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="CNPJ"
          optional
          inputMode="numeric"
          error={errors.cnpj?.message}
          {...register('cnpj')}
        />
        <Input
          label="E-mail de contato"
          type="email"
          optional
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Telefone"
          type="tel"
          optional
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty} isLoading={update.isPending}>
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  none: 'Nenhum',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  ollama: 'IA local (Ollama)',
}

/** Taxas chegam de 0 a 1. */
const percent = (rate: number | null) => (rate === null ? '—' : formatPercent(rate * 100))

function AISummary({ settings }: { settings: AISettings }) {
  const rows = [
    {
      label: 'IA generativa',
      value: (
        <Badge tone={settings.generative_enabled ? 'success' : 'warning'}>
          {settings.generative_enabled ? 'Ativa' : 'Desativada (regras locais)'}
        </Badge>
      ),
    },
    { label: 'Provedor', value: PROVIDER_LABELS[settings.provider] ?? settings.provider },
    { label: 'Modelo', value: settings.model ?? '—' },
    {
      // Assume se o provedor principal falhar ou a cota acabar.
      label: 'Reserva',
      value: settings.fallback_provider
        ? `${PROVIDER_LABELS[settings.fallback_provider] ?? settings.fallback_provider} · ${settings.fallback_model ?? '—'}`
        : 'Nenhuma',
    },
    {
      label: 'Banco vetorial',
      value: settings.vector_store === 'chroma' ? 'ChromaDB' : 'Em memória',
    },
    {
      label: 'Ações da IA (30 dias)',
      value: settings.actions_last_30_days.toLocaleString('pt-BR'),
    },
    { label: 'Taxa de sucesso', value: percent(settings.success_rate) },
    { label: 'Avaliações positivas', value: percent(settings.positive_feedback_rate) },
  ]
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className="text-secondary">{row.label}</dt>
            <dd className="text-right font-medium text-text">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-secondary">
        Provedor, modelo, reserva e chaves são definidos nas variáveis de ambiente do servidor
        (AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_FALLBACK_PROVIDER, OLLAMA_MODEL) e nunca ficam
        visíveis no navegador.
      </p>
    </div>
  )
}
