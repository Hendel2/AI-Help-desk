/**
 * Contratos genéricos da API (ver "Contratos compartilhados" no CLAUDE.md).
 * Os nomes dos campos espelham exatamente o JSON do backend.
 */

/** Corpo de erro padronizado: `{"error": {"code", "message", "details"}}`. */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** Resposta paginada padronizada do backend. */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}
