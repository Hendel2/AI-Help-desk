/**
 * Regras de anexos replicadas no cliente apenas para dar retorno imediato (UX).
 * O backend é quem valida de verdade: extensão, conteúdo real e tamanho (§19).
 */

export const ATTACHMENT_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.log',
  '.md',
  '.csv',
] as const

/** Padrão do backend (`MAX_UPLOAD_SIZE_MB`). */
export const MAX_ATTACHMENT_MB = 10

export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.join(',')

/** Mensagem de erro pt-BR ou `null` quando o arquivo parece aceitável. */
export function checkAttachment(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!ATTACHMENT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return `"${file.name}": tipo não permitido.`
  }
  if (file.size === 0) return `"${file.name}": o arquivo está vazio.`
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
    return `"${file.name}": excede ${MAX_ATTACHMENT_MB} MB.`
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
