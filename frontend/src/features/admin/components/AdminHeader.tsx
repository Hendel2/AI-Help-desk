import type { ReactNode } from 'react'

import { PageHeader } from '@/components/PageHeader'

interface AdminHeaderProps {
  title: string
  description: string
  action?: ReactNode
}

/** Cabeçalho padrão das telas de administração (§50). */
export function AdminHeader({ title, description, action }: AdminHeaderProps) {
  return (
    <PageHeader title={title} description={description} actions={action} />
  )
}
