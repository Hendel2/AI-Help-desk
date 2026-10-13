import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'

import { ErrorState } from '@/components/ErrorState'
import { FileUpload } from '@/components/FileUpload'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/useToast'
import {
  useArticle,
  useImportArticle,
  useSaveArticle,
} from '@/features/knowledge/hooks/useKnowledge'
import { ARTICLE_STATUS_LABELS } from '@/features/knowledge/labels'
import type { ArticleStatus } from '@/features/knowledge/types'
import { useCategories } from '@/features/tickets/hooks/useTickets'
import { getErrorMessage } from '@/services/api/errors'

/** Mesmas regras de `ArticleCreate` no backend. */
const articleSchema = z.object({
  title: z.string().trim().min(3, 'Use pelo menos 3 caracteres.').max(200),
  summary: z.string().trim().max(500, 'Resumo de até 500 caracteres.'),
  content: z.string().trim().min(20, 'Escreva pelo menos 20 caracteres.').max(200_000),
  categoryId: z.string(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  isFeatured: z.boolean(),
})

type ArticleFormValues = z.infer<typeof articleSchema>

const STATUS_OPTIONS = (['DRAFT', 'PUBLISHED', 'ARCHIVED'] as ArticleStatus[]).map((value) => ({
  value,
  label: ARTICLE_STATUS_LABELS[value],
}))

/** Criação/edição de artigo (ADMIN). Publicar indexa o artigo para o Assistente de TI. */
export function KnowledgeEditorPage() {
  const { articleId } = useParams()
  const id = articleId ? Number(articleId) : undefined
  const isEdit = id !== undefined
  const article = useArticle(id ?? 0)
  const save = useSaveArticle(id)
  const importFile = useImportArticle()
  const categories = useCategories()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: '',
      summary: '',
      content: '',
      categoryId: '',
      status: 'DRAFT',
      isFeatured: false,
    },
  })

  // Preenche o formulário quando o artigo chega (edição).
  useEffect(() => {
    if (article.data) {
      reset({
        title: article.data.title,
        summary: article.data.summary ?? '',
        content: article.data.content,
        categoryId: article.data.category ? String(article.data.category.id) : '',
        status: article.data.status,
        isFeatured: article.data.is_featured,
      })
    }
  }, [article.data, reset])

  const onSubmit = async (values: ArticleFormValues) => {
    try {
      const saved = await save.mutateAsync({
        title: values.title,
        summary: values.summary || null,
        content: values.content,
        category_id: values.categoryId ? Number(values.categoryId) : null,
        status: values.status,
        is_featured: values.isFeatured,
      })
      showToast(
        saved.status === 'PUBLISHED'
          ? 'Artigo publicado e disponível para o Assistente de TI.'
          : 'Artigo salvo.',
      )
      void navigate(`/base-de-conhecimento/${saved.id}`, { replace: true })
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível salvar o artigo.'), 'error')
    }
  }

  const onImport = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    try {
      const created = await importFile.mutateAsync({ file, categoryId: null })
      showToast('Arquivo importado como rascunho. Revise e publique.')
      void navigate(`/base-de-conhecimento/${created.id}/editar`, { replace: true })
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível importar o arquivo.'), 'error')
    }
  }

  if (isEdit && article.isPending) return <SkeletonText lines={8} className="mx-auto max-w-3xl" />
  if (isEdit && article.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o artigo."
        description={getErrorMessage(article.error)}
        onRetry={() => void article.refetch()}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ButtonLink
        to={isEdit ? `/base-de-conhecimento/${id}` : '/base-de-conhecimento'}
        variant="ghost"
        size="sm"
        icon={<ArrowLeft aria-hidden="true" className="size-4" />}
        className="-ml-3"
      >
        Voltar
      </ButtonLink>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-text">{isEdit ? 'Editar artigo' : 'Novo artigo'}</h1>
        <p className="text-sm text-secondary">
          Artigos publicados são usados pelo Assistente de TI para responder aos usuários.
        </p>
      </header>

      {!isEdit ? (
        <Card title="Importar de um arquivo">
          <FileUpload
            label={importFile.isPending ? 'Importando…' : 'Escolher arquivo'}
            accept=".pdf,.docx,.txt,.md"
            disabled={importFile.isPending}
            hint="PDF, DOCX, TXT ou MD. O texto vira um rascunho para você revisar antes de publicar."
            onFilesSelected={(files) => void onImport(files)}
          />
        </Card>
      ) : null}

      <form
        noValidate
        className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event)
        }}
      >
        <Input label="Título" error={errors.title?.message} {...register('title')} />
        <Input
          label="Resumo"
          optional
          hint="Uma frase que aparece na listagem."
          error={errors.summary?.message}
          {...register('summary')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Categoria"
            optional
            placeholder="Sem categoria"
            options={(categories.data ?? []).map((category) => ({
              value: String(category.id),
              label: category.name,
            }))}
            {...register('categoryId')}
          />
          <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
        </div>
        <Textarea
          label="Conteúdo"
          rows={14}
          hint="Separe os passos em parágrafos ou listas numeradas."
          error={errors.content?.message}
          {...register('content')}
        />
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register('isFeatured')}
          />
          Destacar entre os artigos populares
        </label>
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" isLoading={save.isPending}>
            Salvar artigo
          </Button>
        </div>
      </form>
    </div>
  )
}
