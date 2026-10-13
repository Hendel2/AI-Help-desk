import type { QueryKey } from '@tanstack/react-query'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminService } from '../services/admin.service'
import type {
  AuditListParams,
  CategoryInput,
  CompanyInput,
  DepartmentInput,
  SLAPolicyInput,
  UserInput,
  UserListParams,
} from '../types'

export const adminKeys = {
  all: ['admin'] as const,
  users: (params: UserListParams) => [...adminKeys.all, 'users', params] as const,
  departments: ['admin', 'departments'] as const,
  categories: ['admin', 'categories'] as const,
  sla: ['admin', 'sla'] as const,
  company: ['admin', 'company'] as const,
  ai: ['admin', 'ai'] as const,
  audit: (params: AuditListParams) => [...adminKeys.all, 'audit', params] as const,
}

/** Mutação que, ao concluir, invalida as listas afetadas. */
function useInvalidatingMutation<TVars, TData>(
  mutationFn: (vars: TVars) => Promise<TData>,
  keys: QueryKey[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
    },
  })
}

// Categorias e técnicos também aparecem fora da administração.
const CATEGORY_KEYS: QueryKey[] = [adminKeys.categories, ['categories']]
const USER_KEYS: QueryKey[] = [[...adminKeys.all, 'users'], adminKeys.departments, ['technicians']]

export function useAdminUsers(params: UserListParams) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: ({ signal }) => adminService.listUsers(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useSaveUser() {
  return useInvalidatingMutation(
    ({ id, data }: { id?: number; data: UserInput }) =>
      id ? adminService.updateUser(id, data) : adminService.createUser(data),
    USER_KEYS,
  )
}

export function useSetUserActive() {
  return useInvalidatingMutation(
    async ({ id, active }: { id: number; active: boolean }) => {
      if (active) await adminService.updateUser(id, { is_active: true })
      else await adminService.deactivateUser(id)
    },
    USER_KEYS,
  )
}

export function useDepartments() {
  return useQuery({
    queryKey: adminKeys.departments,
    queryFn: ({ signal }) => adminService.listDepartments(signal),
  })
}

export function useSaveDepartment() {
  return useInvalidatingMutation(
    ({ id, data }: { id?: number; data: DepartmentInput }) => adminService.saveDepartment(data, id),
    [adminKeys.departments],
  )
}

export function useDeleteDepartment() {
  return useInvalidatingMutation(
    (id: number) => adminService.deleteDepartment(id),
    [adminKeys.departments, [...adminKeys.all, 'users']],
  )
}

export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: ({ signal }) => adminService.listCategories(signal),
  })
}

export function useSaveCategory() {
  return useInvalidatingMutation(
    ({ id, data }: { id?: number; data: CategoryInput }) => adminService.saveCategory(data, id),
    CATEGORY_KEYS,
  )
}

export function useDeleteCategory() {
  return useInvalidatingMutation((id: number) => adminService.deleteCategory(id), CATEGORY_KEYS)
}

export function useSLAPolicies() {
  return useQuery({
    queryKey: adminKeys.sla,
    queryFn: ({ signal }) => adminService.listSLAPolicies(signal),
  })
}

export function useSaveSLAPolicy() {
  return useInvalidatingMutation(
    ({ id, data }: { id?: number; data: SLAPolicyInput }) => adminService.saveSLAPolicy(data, id),
    [adminKeys.sla],
  )
}

export function useDeleteSLAPolicy() {
  return useInvalidatingMutation((id: number) => adminService.deleteSLAPolicy(id), [adminKeys.sla])
}

export function useCompany() {
  return useQuery({
    queryKey: adminKeys.company,
    queryFn: ({ signal }) => adminService.getCompany(signal),
  })
}

export function useUpdateCompany() {
  return useInvalidatingMutation(
    (data: CompanyInput) => adminService.updateCompany(data),
    [adminKeys.company],
  )
}

export function useAISettings() {
  return useQuery({
    queryKey: adminKeys.ai,
    queryFn: ({ signal }) => adminService.getAISettings(signal),
  })
}

export function useAuditLog(params: AuditListParams) {
  return useQuery({
    queryKey: adminKeys.audit(params),
    queryFn: ({ signal }) => adminService.listAudit(params, signal),
    placeholderData: keepPreviousData,
  })
}
