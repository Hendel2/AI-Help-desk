import { Card } from '@/components/ui/Card'
import { cx } from '@/components/ui/styles'

import { THEME_OPTIONS } from '../labels'
import { useTheme } from '../useTheme'

/** Escolha do tema no perfil: rádios nativos (teclado e leitores de tela de graça). */
export function AppearanceSettings() {
  const { preference, setPreference } = useTheme()

  return (
    <Card title="Aparência">
      <fieldset className="space-y-3">
        <legend className="text-sm text-secondary">
          Tema da interface. A escolha vale para este navegador.
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const checked = preference === value
            return (
              <label
                key={value}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm text-text transition-colors',
                  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
                  checked
                    ? 'border-primary bg-primary-soft font-medium'
                    : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={checked}
                  onChange={() => setPreference(value)}
                  className="size-4 accent-primary"
                />
                <Icon aria-hidden="true" className="size-4 text-secondary" />
                {label}
              </label>
            )
          })}
        </div>
      </fieldset>
    </Card>
  )
}
