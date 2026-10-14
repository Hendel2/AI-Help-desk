import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm'
import { ROLE_LABELS } from '@/features/auth/roleLabels'
import { useAuth } from '@/features/auth/useAuth'
import { AppearanceSettings } from '@/features/theme/components/AppearanceSettings'

/** Perfil do usuário autenticado. Sair da conta fica na barra superior. */
export function ProfilePage() {
  const { user } = useAuth()

  // A rota é protegida: sem usuário o ProtectedRoute já teria redirecionado.
  if (!user) return null

  const fields = [
    { label: 'Nome', value: user.name },
    { label: 'E-mail', value: user.email },
    { label: 'Perfil de acesso', value: ROLE_LABELS[user.role] },
    { label: 'Empresa', value: `#${user.company_id}` },
  ]

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title="Meu perfil" description="Dados da sua conta no AI Help Desk." />

      <Card title="Conta">
        <dl className="divide-y divide-border">
          {fields.map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4"
            >
              <dt className="text-sm text-secondary sm:w-40">{label}</dt>
              <dd className="text-sm font-medium text-text">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <AppearanceSettings />

      <ChangePasswordForm />
    </div>
  )
}
