/** Dispara o "salvar arquivo" do navegador para um conteúdo já baixado. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Libera a memória depois que o navegador iniciou o download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
