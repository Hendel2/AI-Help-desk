/**
 * Fragmentos de classe compartilhados pelos primitivos.
 * Mantêm foco, borda e campo de formulário idênticos em todo o app.
 */

/** Anel de foco visível (§54). Usado em botões, links e itens de navegação. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Foco de campos de formulário: borda + anel interno, sem deslocar o layout. */
export const FIELD_FOCUS =
  'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none'

/** Base visual de input, select e textarea. */
export const FIELD_BASE = `w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-secondary transition-colors ${FIELD_FOCUS} aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-secondary`

/** Junta classes condicionais sem dependência externa. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
