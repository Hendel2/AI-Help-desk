import { useMutation } from '@tanstack/react-query'

import { aiService } from '../services/ai.service'

/** Sugestão de categoria e prioridade para um novo chamado (§47). */
export function useClassifyTicket() {
  return useMutation({
    mutationFn: (text: string) => aiService.classify(text),
    // Falha da IA não deve atrapalhar a abertura: sem retry e sem toast.
    retry: false,
  })
}
