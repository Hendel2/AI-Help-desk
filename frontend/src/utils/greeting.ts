/** Saudação pelo horário local ("Bom dia", "Boa tarde", "Boa noite"). */
export function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}
