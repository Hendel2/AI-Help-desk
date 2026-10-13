/** Contratos da base de conhecimento — espelham `backend/app/schemas/knowledge.py`. */

import type { CategorySummary } from '@/features/tickets/types'

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ArticleSort = 'recent' | 'popular' | 'title'

export interface ArticleListItem {
  id: number
  title: string
  summary: string | null
  status: ArticleStatus
  is_featured: boolean
  view_count: number
  helpful_count: number
  not_helpful_count: number
  updated_at: string
  category: CategorySummary | null
  author: { id: number; name: string } | null
}

export interface Article extends ArticleListItem {
  content: string
  source_type: 'MANUAL' | 'UPLOAD'
  source_file_name: string | null
  indexed_at: string | null
  created_at: string
}

export interface ArticleInput {
  title: string
  summary: string | null
  content: string
  category_id: number | null
  status: ArticleStatus
  is_featured: boolean
}

export interface ArticleListParams {
  search?: string
  categoryId?: number | null
  status?: ArticleStatus
  sort?: ArticleSort
  page?: number
  pageSize?: number
}

/** Trecho encontrado pela busca semântica (fonte citável). */
export interface ArticleSuggestion {
  article_id: number
  title: string
  excerpt: string
  score: number
}
