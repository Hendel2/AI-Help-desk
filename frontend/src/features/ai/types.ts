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

export type CopilotAction = 'summarize' | 'suggest_solution' | 'generate_response' | 'analyze_history'

export interface CopilotSource {
  article_id: number
  title: string
  excerpt?: string | null
}

/** Sugestão do AI Copilot: texto editável que o técnico revisa antes de usar (§30). */
export interface CopilotSuggestion {
  action: CopilotAction
  text: string
  sources: CopilotSource[]
  mode: 'llm' | 'heuristic'
}
