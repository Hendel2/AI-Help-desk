import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/useToast'
import { getErrorMessage } from '@/services/api/errors'

import { changePassword } from '../services/auth.service'

const schema = z
  .object({
    current: z.string().min(1, 'Informe a senha atual.'),
    next: z.string().min(8, 'Mínimo de 8 caracteres.').max(128, 'Máximo de 128 caracteres.'),
    confirm: z.string(),
  })
  .refine((data) => data.next === data.confirm, {
    path: ['confirm'],
    message: 'As senhas não coincidem.',
  })

type FormValues = z.infer<typeof schema>

/** Troca da própria senha (exige a senha atual). */
export function ChangePasswordForm() {
  const { showToast } = useToast()
  const mutation = useMutation({
    mutationFn: ({ current, next }: FormValues) => changePassword(current, next),
  })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { current: '', next: '', confirm: '' },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await mutation.mutateAsync(values)
      reset()
      showToast('Senha alterada.')
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível alterar a senha.'), 'error')
    }
  }

  return (
    <Card title="Alterar senha">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        <Input
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          error={errors.current?.message}
          {...register('current')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            hint="Mínimo de 8 caracteres."
            error={errors.next?.message}
            {...register('next')}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" isLoading={mutation.isPending}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  )
}
