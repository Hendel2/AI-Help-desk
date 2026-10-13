import { del, get, post, put } from '@/services/api/client'
import type { Paginated } from '@/types/api'

import type {
  Article,
  ArticleInput,
  ArticleListItem,
  ArticleListParams,
  ArticleSuggestion,
} from '../types'

/** Chamadas HTTP da base de conhecimento. */
export const knowledgeService = {
  list: (params: ArticleListParams, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    query.set('page', String(params.page ?? 1))
    query.set('page_size', String(params.pageSize ?? 20))
    query.set('sort', params.sort ?? 'recent')
    if (params.search?.trim()) query.set('search', params.search.trim())
    if (params.categoryId) query.set('category_id', String(params.categoryId))
    if (params.status) query.set('status', params.status)
    return get<Paginated<ArticleListItem>>(`/knowledge?${query.toString()}`, { signal })
  },
  get: (id: number, signal?: AbortSignal) => get<Article>(`/knowledge/${id}`, { signal }),
  suggest: (q: string, signal?: AbortSignal) =>
    get<ArticleSuggestion[]>(`/knowledge/suggest?q=${encodeURIComponent(q)}`, { signal }),
  create: (data: ArticleInput) => post<Article>('/knowledge', data),
  update: (id: number, data: Partial<ArticleInput>) => put<Article>(`/knowledge/${id}`, data),
  remove: (id: number) => del(`/knowledge/${id}`),
  feedback: (id: number, helpful: boolean) =>
    post<Article>(`/knowledge/${id}/feedback`, { helpful }),
  upload: (file: File, categoryId: number | null) => {
    const form = new FormData()
    form.append('file', file)
    if (categoryId) form.append('category_id', String(categoryId))
    return post<Article>('/knowledge/upload', form)
  },
}
