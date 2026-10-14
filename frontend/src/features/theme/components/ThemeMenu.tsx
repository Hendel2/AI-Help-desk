import { Monitor, Moon, Sun } from 'lucide-react'

import { Menu, MenuGroup, MenuRadioItem } from '@/components/ui/Menu'

import { THEME_OPTIONS } from '../labels'
import { useTheme } from '../useTheme'

/** Seletor de tema da barra superior: claro, escuro ou o do sistema. */
export function ThemeMenu() {
  const { preference, theme, setPreference } = useTheme()
  // O ícone mostra o tema em uso; "Do sistema" ganha o ícone de monitor.
  const Icon = preference === 'system' ? Monitor : theme === 'dark' ? Moon : Sun

  return (
    <Menu
      label="Tema"
      trigger={<Icon aria-hidden="true" className="size-5" />}
      triggerClassName="rounded-md p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text"
    >
      <MenuGroup label="Aparência">
        {THEME_OPTIONS.map(({ value, label, icon: OptionIcon }) => (
          <MenuRadioItem
            key={value}
            checked={preference === value}
            icon={<OptionIcon aria-hidden="true" className="size-4 text-secondary" />}
            onSelect={() => setPreference(value)}
          >
            {label}
          </MenuRadioItem>
        ))}
      </MenuGroup>
    </Menu>
  )
}
