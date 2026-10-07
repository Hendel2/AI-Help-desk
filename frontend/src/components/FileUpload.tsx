import { Paperclip } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useId, useRef } from 'react'

import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/styles'

export interface FileUploadProps {
  /** Texto do botão (ex.: "Anexar arquivos"). */
  label: string
  /** Lista do atributo `accept` (ex.: ".png,.pdf"). */
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /** Explica formatos e limite de tamanho. */
  hint?: string
  onFilesSelected: (files: File[]) => void
  className?: string
}

/**
 * Seleção de arquivos acessível: um `<input type="file">` real, com rótulo
 * estilizado como botão. Validação aqui é só UX — o backend valida de verdade.
 */
export function FileUpload({
  label,
  accept,
  multiple = false,
  disabled = false,
  hint,
  onFilesSelected,
  className,
}: FileUploadProps) {
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) onFilesSelected(files)
    // Permite escolher o mesmo arquivo de novo depois de removê-lo.
    event.target.value = ''
  }

  return (
    <div className={cx('space-y-1.5', className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={handleChange}
        className="peer sr-only"
      />
      <label
        htmlFor={inputId}
        className={buttonClasses({
          variant: 'secondary',
          size: 'sm',
          className: cx(
            'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
            disabled && 'pointer-events-none opacity-60',
          ),
        })}
      >
        <Paperclip aria-hidden="true" className="size-4" />
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
