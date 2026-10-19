/** Contratos do Assistente de TI — espelham `backend/app/schemas/chat.py`. */

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM'
export type ConversationStatus = 'ACTIVE' | 'RESOLVED' | 'ESCALATED' | 'CLOSED'

export interface MessageSource {
  article_id: number
  title: string
}

export interface ChatMessageData {
  id: number
  role: MessageRole
  content: string
  intent: string | null
  sources: MessageSource[] | null
  suggest_ticket: boolean
  created_at: string
}

export interface ConversationSummary {
  id: number
  title: string | null
  status: ConversationStatus
  ticket_id: number | null
  created_at: string
  updated_at: string
}

export interface Conversation extends ConversationSummary {
  messages: ChatMessageData[]
}

export interface ChatTurn {
  user_message: ChatMessageData
  assistant_message: ChatMessageData
}

/** Como o assistente responde agora (`GET /chat/assistant`). */
export interface AssistantInfo {
  /** Sem IA, o assistente só sugere procedimentos da base de conhecimento e abre chamados. */
  ai_enabled: boolean
  /** IA local no processador: cada resposta leva dezenas de segundos. */
  slow_responses: boolean
}
