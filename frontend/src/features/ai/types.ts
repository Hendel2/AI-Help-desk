/** Contratos de IA — espelham `backend/app/schemas/ai.py`. */

import type { TicketPriority } from '@/features/tickets/types'

export interface ClassificationSuggestion {
  intent: string
  category_id: number | null
  category_name: string | null
  priority: TicketPriority
  confidence: number
  /** `llm` = modelo de IA; `heuristic` = regras locais (sem provedor configurado). */
  source: 'llm' | 'heuristic'
}
