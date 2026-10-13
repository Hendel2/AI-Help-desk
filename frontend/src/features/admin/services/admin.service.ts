import { del, get, post, put } from '@/services/api/client'
import type { Paginated } from '@/types/api'

import type {
  AdminCategory,
  AdminUser,
  AISettings,
  AuditEntry,
  AuditListParams,
  CategoryInput,
  Company,
  CompanyInput,
  Department,
  DepartmentInput,
  SLAPolicy,
  SLAPolicyInput,
  UserInput,
  UserListParams,
} from '../types'

/** Chamadas HTTP da administração (somente ADMIN; o backend valida). */
export const adminService = {
  listUsers: (params: UserListParams, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(params.page ?? 1), page_size: '20' })
    if (params.search?.trim()) query.set('q', params.search.trim())
    if (params.role) query.set('role', params.role)
    if (params.status) query.set('is_active', String(params.status === 'active'))
    return get<Paginated<AdminUser>>(`/users?${query.toString()}`, { signal })
  },
  createUser: (data: UserInput) => post<AdminUser>('/users', data),
  updateUser: (id: number, data: Partial<UserInput>) => put<AdminUser>(`/users/${id}`, data),
  deactivateUser: (id: number) => del(`/users/${id}`),

  listDepartments: (signal?: AbortSignal) => get<Department[]>('/departments', { signal }),
  saveDepartment: (data: DepartmentInput, id?: number) =>
    id ? put<Department>(`/departments/${id}`, data) : post<Department>('/departments', data),
  deleteDepartment: (id: number) => del(`/departments/${id}`),

  listCategories: (signal?: AbortSignal) => get<AdminCategory[]>('/categories/manage', { signal }),
  saveCategory: (data: CategoryInput, id?: number) =>
    id ? put<AdminCategory>(`/categories/${id}`, data) : post<AdminCategory>('/categories', data),
  deleteCategory: (id: number) => del(`/categories/${id}`),

  listSLAPolicies: (signal?: AbortSignal) => get<SLAPolicy[]>('/sla-policies', { signal }),
  saveSLAPolicy: (data: SLAPolicyInput, id?: number) =>
    id ? put<SLAPolicy>(`/sla-policies/${id}`, data) : post<SLAPolicy>('/sla-policies', data),
  deleteSLAPolicy: (id: number) => del(`/sla-policies/${id}`),

  getCompany: (signal?: AbortSignal) => get<Company>('/company', { signal }),
  updateCompany: (data: CompanyInput) => put<Company>('/company', data),
  getAISettings: (signal?: AbortSignal) => get<AISettings>('/ai/settings', { signal }),

  listAudit: (params: AuditListParams, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(params.page ?? 1), page_size: '25' })
    if (params.action) query.set('action', params.action)
    return get<Paginated<AuditEntry>>(`/audit-logs?${query.toString()}`, { signal })
  },
}
