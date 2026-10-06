import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/useAuth'
import { getErrorMessage } from '@/services/api/errors'

/** Espelha `LoginRequest` no backend: a senha só precisa ser informada — a
 * política de tamanho vale no cadastro, não no login. */
const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail.').email('Informe um e-mail válido.'),
  password: z
    .string()
    .min(1, 'Informe sua senha.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/perfil'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />
  }

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login(values)
      void navigate(redirectTo, { replace: true })
    } catch (error) {
      // Erro de credenciais vem do backend com mensagem pronta em pt-BR.
      setError('root', { message: getErrorMessage(error, 'Não foi possível entrar.') })
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text">Entrar no AI Help Desk</h1>
        <p className="text-sm text-secondary">Acesse com suas credenciais corporativas.</p>
      </header>

      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event)
        }}
      >
        {errors.root?.message ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {errors.root.message}
          </p>
        ) : null}

        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>

      <p className="text-sm text-secondary">
        <Link to="/status" className="underline underline-offset-4 hover:text-primary">
          Ver status do sistema
        </Link>
      </p>
    </main>
  )
}
