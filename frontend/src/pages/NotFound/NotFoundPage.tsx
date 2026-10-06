import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-sm font-medium text-secondary">Erro 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-2 text-secondary">O endereço acessado não existe ou foi removido.</p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-sm text-sm font-medium text-text underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Voltar para o início
      </Link>
    </main>
  )
}
