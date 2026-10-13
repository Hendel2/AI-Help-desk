import { useMutation } from '@tanstack/react-query'

import { aiService } from '../services/ai.service'
import type { CopilotAction } from '../types'

/** Ações do AI Copilot sobre um chamado (§30). Cada clique gera uma nova sugestão. */
export function useCopilot(ticketId: number) {
  const run = useMutation({
    mutationFn: (action: CopilotAction) => aiService.copilot(action, ticketId),
    retry: false,
  })
  const articles = useMutation({
    mutationFn: () => aiService.findArticles(ticketId),
    retry: false,
  })
  return { run, articles }
}
