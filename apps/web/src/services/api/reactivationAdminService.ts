// apps/web/src/services/api/reactivationAdminService.ts
// Push one-shot de reativação (spec 126). Endpoint único /api/admin?resource=reactivation (R-090).
// Toda trava (confirmação, uma tentativa por conta, filtro de versão) mora no HANDLER; aqui só transporte.

import { supabase } from '@shared/utils/supabase'

export type ReactivationVariant = 'A' | 'B' | 'C' | 'D' | 'E'
export type ReactivationSkipReason = 'already_sent' | 'consent_revoked' | 'push_disabled' | 'no_eligible_device' | 'quiet_hours'

export interface ReactivationCopy {
  title: string
  body: string
}

export interface ReactivationRequest {
  user_ids: string[]
  variant: ReactivationVariant
  min_version: string
}

interface ReactivationBase {
  variant: ReactivationVariant
  preview: ReactivationCopy
  min_version: string
  cohort: number
  skipped: Array<{ user_id: string; reason: ReactivationSkipReason }>
  skipped_by_reason: Partial<Record<ReactivationSkipReason, number>>
}

export interface ReactivationSimulation extends ReactivationBase {
  mode: 'simulate'
  would_send: string[]
}

export interface ReactivationSendResult extends ReactivationBase {
  mode: 'send'
  sent: Array<{ user_id: string; delivered: number; failed: number }>
  unlogged: string[]
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Não autenticado.')
  return { Authorization: `Bearer ${token}` }
}

async function call<T>(init: { method: 'GET' | 'POST'; body?: string; query?: string }): Promise<T> {
  const headers = await authHeaders()
  const response = await fetch(`/api/admin?resource=reactivation${init.query ?? ''}`, {
    method: init.method,
    body: init.body,
    headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  const body = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
  if (!response.ok) {
    if (response.status === 401) throw new Error('Não autorizado.')
    throw new Error(body.error || 'Falha na reativação')
  }
  if (!body || typeof body !== 'object' || body.data == null) throw new Error('Resposta inesperada do servidor')
  return body.data as T
}

export const reactivationAdminService = {
  getVariants(): Promise<Record<ReactivationVariant, ReactivationCopy>> {
    return call({ method: 'GET', query: '&action=variants' })
  },

  /** POST com `simulate: true`: coorte grande não cabe na URL de um GET. */
  simulate(request: ReactivationRequest): Promise<ReactivationSimulation> {
    return call({ method: 'POST', body: JSON.stringify({ ...request, simulate: true }) })
  },

  send(request: ReactivationRequest, confirm: string): Promise<ReactivationSendResult> {
    return call({ method: 'POST', body: JSON.stringify({ ...request, confirm }) })
  },
}

export default reactivationAdminService
