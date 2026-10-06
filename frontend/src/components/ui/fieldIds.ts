/** Ids derivados do campo, usados em `aria-describedby`. */
export function fieldIds(id: string) {
  return { hintId: `${id}-hint`, errorId: `${id}-error` }
}
