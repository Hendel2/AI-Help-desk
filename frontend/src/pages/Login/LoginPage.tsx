import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/useAuth'
import { ThemeMenu } from '@/features/theme/components/ThemeMenu'
import { getErrorMessage } from '@/services/api/errors'

import { QueuePreview } from './QueuePreview'

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
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'

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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <BrandMark />
          <ThemeMenu />
        </div>

        <div className="mx-auto my-auto w-full max-w-sm space-y-8 py-12">
          <header className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">Entrar</h1>
            <p className="text-sm text-secondary">Use o e-mail e a senha da sua empresa.</p>
          </header>

          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              void handleSubmit(onSubmit)(event)
            }}
          >
            {errors.root?.message ? (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
              >
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
        </div>

        <p className="text-sm text-secondary">
          <Link
            to="/status"
            className="rounded-sm underline decoration-border-strong underline-offset-4 hover:text-text"
          >
            Ver status do sistema
          </Link>
        </p>
      </main>

      {/* Painel sempre grafite (tokens do tema escuro só aqui): mostra o produto em vez de descrevê-lo. */}
      <aside
        data-theme="dark"
        aria-label="Sobre o AI Help Desk"
        className="hidden flex-col justify-center gap-10 border-l border-border bg-surface px-12 py-16 text-text lg:flex xl:px-20"
      >
        <div className="max-w-lg space-y-3">
          <p className="text-3xl font-semibold tracking-tight text-balance">
            Todo chamado com dono e prazo.
          </p>
          <p className="text-sm text-secondary">
            A fila mostra quanto do prazo cada atendimento já usou. O assistente responde o que a
            base de conhecimento já resolve e abre um chamado quando não sabe.
          </p>
        </div>
        <div className="max-w-lg">
          <QueuePreview />
        </div>
      </aside>
    </div>
  )
}
