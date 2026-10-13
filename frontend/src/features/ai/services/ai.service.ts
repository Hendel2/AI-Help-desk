import { post } from '@/services/api/client'

import type {
  ClassificationSuggestion,
  CopilotAction,
  CopilotSource,
  CopilotSuggestion,
} from '../types'

const COPILOT_PATHS: Record<CopilotAction, string> = {
  summarize: '/ai/summarize',
  suggest_solution: '/ai/suggest-solution',
  generate_response: '/ai/generate-response',
  analyze_history: '/ai/analyze-history',
}

/** Chamadas HTTP da camada de IA. A IA só sugere — nada aqui altera dados. */
export const aiService = {
  classify: (text: string) => post<ClassificationSuggestion>('/ai/classify', { text }),
  copilot: (action: CopilotAction, ticketId: number) =>
    post<CopilotSuggestion>(COPILOT_PATHS[action], { ticket_id: ticketId }),
  findArticles: (ticketId: number) =>
    post<CopilotSource[]>('/ai/find-articles', { ticket_id: ticketId }),
}
