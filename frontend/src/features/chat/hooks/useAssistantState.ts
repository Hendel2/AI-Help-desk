import { useAssistantInfo } from './useChat'

export interface AssistantState {
  /** Rótulo curto (sidebar, bolinha). */
  label: string
  /** Frase completa (painel). */
  detail: string
  /** Cor do ponto de status (texto acompanha: nunca só cor). */
  dot: string
}

/** Como o assistente responde agora: IA ativa, IA local (lenta) ou sem IA. `null` = carregando. */
export function useAssistantState(): AssistantState | null {
  const info = useAssistantInfo()
  if (!info.data) return null
  if (!info.data.ai_enabled) {
    return { label: 'Sem IA', detail: 'Sem IA: sugiro os guias da base', dot: 'bg-secondary' }
  }
  if (info.data.slow_responses) {
    return { label: 'IA local', detail: 'IA local: respostas mais lentas', dot: 'bg-warning' }
  }
  return { label: 'IA ativa', detail: 'IA ativa: respostas em segundos', dot: 'bg-success' }
}
