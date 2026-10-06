import { ROLE_LABELS } from '@/features/auth/roleLabels'
import { useAuth } from '@/features/auth/useAuth'

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
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text">Meu perfil</h1>
        <p className="text-sm text-secondary">Dados da sua conta no AI Help Desk.</p>
      </header>

      <dl className="divide-y divide-border border-y border-border">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
            <dt className="text-sm text-secondary sm:w-48">{label}</dt>
            <dd className="text-sm font-medium text-text">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
