import { post } from '@/services/api/client'

import type { ClassificationSuggestion } from '../types'

/** Chamadas HTTP da camada de IA. A IA só sugere — nada aqui altera dados. */
export const aiService = {
  classify: (text: string) => post<ClassificationSuggestion>('/ai/classify', { text }),
}
