import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import * as ticketsService from '../services/tickets.service'
import type { Ticket, TicketCreateData, TicketListParams, TicketStatus, TicketUpdateData } from '../types'

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (params: TicketListParams) => [...ticketKeys.lists(), params] as const,
  detail: (id: number) => [...ticketKeys.all, 'detail', id] as const,
  comments: (id: number) => [...ticketKeys.all, 'detail', id, 'comments'] as const,
  history: (id: number) => [...ticketKeys.all, 'detail', id, 'history'] as const,
  attachments: (id: number) => [...ticketKeys.all, 'detail', id, 'attachments'] as const,
  categories: ['categories'] as const,
}

export function useTicketList(params: TicketListParams) {
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: ({ signal }) => ticketsService.listTickets(params, signal),
    // Mantém a página anterior visível enquanto a próxima carrega (paginação/filtros).
    placeholderData: keepPreviousData,
  })
}

export function useTicket(id: number) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: ({ signal }) => ticketsService.getTicket(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useTicketComments(id: number) {
  return useQuery({
    queryKey: ticketKeys.comments(id),
    queryFn: ({ signal }) => ticketsService.listComments(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useTicketHistory(id: number, enabled = true) {
  return useQuery({
    queryKey: ticketKeys.history(id),
    queryFn: ({ signal }) => ticketsService.listHistory(id, signal),
    enabled: enabled && Number.isInteger(id) && id > 0,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ticketKeys.categories,
    queryFn: ({ signal }) => ticketsService.listCategories(signal),
    // Categorias mudam pouco: evita refetch a cada tela.
    staleTime: 5 * 60_000,
  })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: TicketCreateData) => ticketsService.createTicket(data),
    onSuccess: (ticket) => {
      queryClient.setQueryData(ticketKeys.detail(ticket.id), ticket)
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
    },
  })
}

/**
 * Ações sobre um chamado existente. Toda resposta traz o chamado atualizado:
 * o detalhe é substituído no cache e listas, comentários e histórico são
 * revalidados (a ação pode ter gerado comentário e entradas de histórico).
 */
export function useTicketActions(id: number) {
  const queryClient = useQueryClient()

  const onSuccess = (ticket: Ticket) => {
    queryClient.setQueryData(ticketKeys.detail(id), ticket)
    void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: ticketKeys.comments(id) })
    void queryClient.invalidateQueries({ queryKey: ticketKeys.history(id) })
  }

  return {
    assign: useMutation({
      mutationFn: (technicianId?: number) => ticketsService.assignTicket(id, technicianId),
      onSuccess,
    }),
    changeStatus: useMutation({
      mutationFn: ({ status, comment }: { status: TicketStatus; comment?: string }) =>
        ticketsService.changeTicketStatus(id, status, comment),
      onSuccess,
    }),
    resolve: useMutation({
      mutationFn: (solution: string) => ticketsService.resolveTicket(id, solution),
      onSuccess,
    }),
    close: useMutation({
      mutationFn: (reason?: string) => ticketsService.closeTicket(id, reason),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: (data: TicketUpdateData) => ticketsService.updateTicket(id, data),
      onSuccess,
    }),
  }
}

export function useAddComment(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ content, isInternal }: { content: string; isInternal: boolean }) =>
      ticketsService.addComment(id, content, isInternal),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.comments(id) })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.history(id) })
      // A primeira resposta da equipe muda o SLA de resposta.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id), exact: true })
    },
  })
}

export function useTicketAttachments(id: number) {
  return useQuery({
    queryKey: ticketKeys.attachments(id),
    queryFn: ({ signal }) => ticketsService.listAttachments(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useUploadAttachment(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => ticketsService.uploadAttachment(id, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.attachments(id) })
    },
  })
}

/**
 * Envia vários anexos para um chamado (usado logo após a abertura). Não
 * interrompe no primeiro erro: devolve os arquivos que falharam.
 */
export function useAttachFiles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ticketId, files }: { ticketId: number; files: File[] }) => {
      const failed: File[] = []
      for (const file of files) {
        try {
          await ticketsService.uploadAttachment(ticketId, file)
        } catch {
          failed.push(file)
        }
      }
      return failed
    },
    onSuccess: (_failed, { ticketId }) => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.attachments(ticketId) })
    },
  })
}
