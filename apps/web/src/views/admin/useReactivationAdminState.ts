// apps/web/src/views/admin/useReactivationAdminState.ts
// Estado do painel de reativação (spec 126). Enviar só libera depois de uma simulação com os MESMOS
// campos e com `ENVIAR` digitado — conveniência; a trava de verdade é do servidor.

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  reactivationAdminService,
  type ReactivationCopy,
  type ReactivationSendResult,
  type ReactivationSimulation,
  type ReactivationVariant,
} from '@services/api/reactivationAdminService'
import { parseCohort, isValidMinVersion, simulationKey, CONFIRM_TOKEN, COHORT_MAX } from './reactivationFormUtils'

type Message = { type: 'success' | 'error'; text: string } | null

export function useReactivationAdminState() {
  const [cohortText, setCohortText] = useState('')
  const [variant, setVariant] = useState<ReactivationVariant>('B')
  const [minVersion, setMinVersion] = useState('0.35.0')
  const [variants, setVariants] = useState<Record<ReactivationVariant, ReactivationCopy> | null>(null)
  const [simulation, setSimulation] = useState<{ key: string; data: ReactivationSimulation } | null>(null)
  const [result, setResult] = useState<ReactivationSendResult | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState<'simulate' | 'send' | null>(null)
  const [message, setMessage] = useState<Message>(null)

  const cohort = useMemo(() => parseCohort(cohortText), [cohortText])
  const versionOk = useMemo(() => isValidMinVersion(minVersion), [minVersion])
  const currentKey = useMemo(() => simulationKey(cohort.valid, variant, minVersion), [cohort.valid, variant, minVersion])
  const canSimulate = cohort.valid.length > 0 && cohort.valid.length <= COHORT_MAX && versionOk && loading === null
  const simulationFresh = simulation !== null && simulation.key === currentKey
  const canSend = simulationFresh && (simulation?.data.would_send.length ?? 0) > 0 && confirmText === CONFIRM_TOKEN && loading === null

  useEffect(() => {
    let alive = true
    reactivationAdminService
      .getVariants()
      .then((data) => { if (alive) setVariants(data) })
      .catch((err: Error) => { if (alive) setMessage({ type: 'error', text: err.message }) })
    return () => { alive = false }
  }, [])

  const request = useCallback(
    () => ({ user_ids: cohort.valid, variant, min_version: minVersion.trim() }),
    [cohort.valid, variant, minVersion],
  )

  const simulate = useCallback(async () => {
    setLoading('simulate')
    setMessage(null)
    setResult(null)
    setConfirmText('')
    try {
      const data = await reactivationAdminService.simulate(request())
      setSimulation({ key: currentKey, data })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Falha na simulação' })
    } finally {
      setLoading(null)
    }
  }, [request, currentKey])

  const send = useCallback(async () => {
    setLoading('send')
    setMessage(null)
    try {
      const data = await reactivationAdminService.send(request(), confirmText)
      setResult(data)
      setSimulation(null)
      setConfirmText('')
      setMessage({ type: data.unlogged.length > 0 ? 'error' : 'success', text: `${data.sent.length} enviado(s), ${data.skipped.length} pulado(s).` })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Falha no envio' })
    } finally {
      setLoading(null)
    }
  }, [request, confirmText])

  return {
    cohortText, setCohortText, cohort,
    variant, setVariant, variants,
    minVersion, setMinVersion, versionOk,
    simulation: simulationFresh ? simulation.data : null,
    staleSimulation: simulation !== null && !simulationFresh,
    result, confirmText, setConfirmText,
    loading, message, canSimulate, canSend,
    simulate, send,
  }
}
