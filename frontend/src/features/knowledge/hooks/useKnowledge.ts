import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { knowledgeService } from '../services/knowledge.service'
import type { ArticleInput, ArticleListParams } from '../types'

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  list: (params: ArticleListParams) => [...knowledgeKeys.all, 'list', params] as const,
  detail: (id: number) => [...knowledgeKeys.all, 'detail', id] as const,
  suggest: (q: string) => [...knowledgeKeys.all, 'suggest', q] as const,
}

export function useArticles(params: ArticleListParams) {
  return useQuery({
    queryKey: knowledgeKeys.list(params),
    queryFn: ({ signal }) => knowledgeService.list(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useArticle(id: number) {
  return useQuery({
    queryKey: knowledgeKeys.detail(id),
    queryFn: ({ signal }) => knowledgeService.get(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  })
}

/** Artigos relacionados a um texto (busca semântica do RAG). */
export function useArticleSuggestions(q: string) {
  return useQuery({
    queryKey: knowledgeKeys.suggest(q),
    queryFn: ({ signal }) => knowledgeService.suggest(q, signal),
    enabled: q.trim().length >= 3,
    staleTime: 60_000,
  })
}

export function useSaveArticle(id?: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ArticleInput) =>
      id ? knowledgeService.update(id, data) : knowledgeService.create(data),
    onSuccess: (article) => {
      queryClient.setQueryData(knowledgeKeys.detail(article.id), article)
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.all })
    },
  })
}

export function useDeleteArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => knowledgeService.remove(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: knowledgeKeys.all }),
  })
}

export function useArticleFeedback(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (helpful: boolean) => knowledgeService.feedback(id, helpful),
    onSuccess: (article) => queryClient.setQueryData(knowledgeKeys.detail(id), article),
  })
}

export function useImportArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, categoryId }: { file: File; categoryId: number | null }) =>
      knowledgeService.upload(file, categoryId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: knowledgeKeys.all }),
  })
}
