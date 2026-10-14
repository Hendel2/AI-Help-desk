import { Download, FileText } from 'lucide-react'
import { useState } from 'react'

import { ErrorState } from '@/components/ErrorState'
import { FileUpload } from '@/components/FileUpload'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { getErrorMessage } from '@/services/api/errors'
import { saveBlob } from '@/utils/download'

import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  formatFileSize,
  MAX_ATTACHMENT_MB,
} from '../attachments'
import { useTicketAttachments, useUploadAttachment } from '../hooks/useTickets'
import { downloadAttachment } from '../services/tickets.service'
import type { Ticket, TicketAttachment } from '../types'

const CLOSED_STATUSES = new Set(['CLOSED', 'CANCELLED'])

/** Painel "Anexos" do chamado (§19). */
export function TicketAttachments({ ticket }: { ticket: Ticket }) {
  const attachments = useTicketAttachments(ticket.id)
  const upload = useUploadAttachment(ticket.id)
  const { showToast } = useToast()
  const canUpload = !CLOSED_STATUSES.has(ticket.status)

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      const problem = checkAttachment(file)
      if (problem) {
        showToast(problem, 'error')
        continue
      }
      try {
        await upload.mutateAsync(file)
        showToast(`"${file.name}" anexado.`)
      } catch (error) {
        showToast(getErrorMessage(error, `Não foi possível anexar "${file.name}".`), 'error')
      }
    }
  }

  return (
    <Card title="Anexos">
      <div className="space-y-4">
        {attachments.isPending ? (
          <SkeletonText lines={2} />
        ) : attachments.isError ? (
          <ErrorState
            title="Não foi possível carregar os anexos."
            description={getErrorMessage(attachments.error)}
            onRetry={() => void attachments.refetch()}
            className="py-4"
          />
        ) : attachments.data.length === 0 ? (
          <p className="text-sm text-secondary">Nenhum arquivo anexado.</p>
        ) : (
          <ul className="space-y-2">
            {attachments.data.map((attachment) => (
              <li key={attachment.id}>
                <AttachmentRow ticketId={ticket.id} attachment={attachment} />
              </li>
            ))}
          </ul>
        )}

        {canUpload ? (
          <FileUpload
            label={upload.isPending ? 'Enviando…' : 'Anexar arquivos'}
            multiple
            accept={ATTACHMENT_ACCEPT}
            disabled={upload.isPending}
            hint={`Imagens, PDF, Office ou texto, até ${MAX_ATTACHMENT_MB} MB cada.`}
            onFilesSelected={(files) => void handleFiles(files)}
          />
        ) : null}
      </div>
    </Card>
  )
}

function AttachmentRow({ ticketId, attachment }: { ticketId: number; attachment: TicketAttachment }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const { showToast } = useToast()

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      saveBlob(await downloadAttachment(ticketId, attachment.id), attachment.file_name)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível baixar o arquivo.'), 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text" title={attachment.file_name}>
          {attachment.file_name}
        </p>
        <p className="text-xs text-secondary">
          {formatFileSize(attachment.file_size)}, enviado por {attachment.uploader.name}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        isLoading={isDownloading}
        icon={<Download aria-hidden="true" className="size-4" />}
        onClick={() => void handleDownload()}
      >
        <span className="sr-only">Baixar {attachment.file_name}</span>
      </Button>
    </div>
  )
}
