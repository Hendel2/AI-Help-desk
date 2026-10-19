import { ArrowLeft } from 'lucide-react'

import { BrandMark } from '@/components/BrandMark'
import { ButtonLink } from '@/components/ui/ButtonLink'

export function NotFoundPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <BrandMark />
      <h1 className="mt-16 text-2xl font-semibold tracking-tight text-text">
        Página não encontrada
      </h1>
      <p className="mt-2 text-secondary">
        O endereço não existe ou foi removido. Confira o link ou volte para o início.
      </p>
      <ButtonLink
        to="/"
        variant="secondary"
        className="mt-6"
        icon={<ArrowLeft aria-hidden="true" className="size-4" />}
      >
        Voltar para o início
      </ButtonLink>
    </main>
  )
}
