// useTodaySetup — superfície SETUP da Hoje (spec 125 fatia 2 · AC6.1–AC6.7 · FR-017..FR-019, FR-024).
//
// Monta as entradas da fila e delega a escolha ao core (`pickSetupCard`, INV-6): a Hoje só mostra.
// - "1º uso": `created_at` ≤ 14 d e nenhum registro do tratamento nos 14 d que a Hoje já carrega.
// - Confira: `classifyCoherence` sobre as forças do REGISTRO no sidecar 127 (`useCmedStrengths`), que só
//   carrega quando há injetável com registro (RC3 E-4). O slot espera o veredito, teto 2 s (AC6.4e):
//   nunca mostra "Tratamento cadastrado" e troca por "Confira" em seguida.
// - Confirmações ficam NO APARELHO (sem coluna, Q3 b), via `nativeStorageAdapter`:
//     dosiq:setup-confirmed:<coherenceKey>   ("Aplico X mesmo" — vale para a combinação, AC6.4a)
//     dosiq:setup-schedule:<id>:<agenda>     ("Sim" do dia/hora — agenda mudou ⇒ pergunta de novo)
// - Snapshot offline (stale): sem card (falha fechada — o cache não prova "sem dose registrada").
// - 2a (FR-037..043): Corrigir forma (`formMismatch`, só remédio COM código) sobre as formas `f` do REGISTRO
//   no sidecar — que agora carrega para qualquer remédio com registro —; sem registro, as `forms` do item de
//   MESMO nome na base leve, só de marca (prod 22/11: quase todo cadastro com código não tem registro;
//   genérico fica de fora — Budesonida só 'liquido', C-2a-10); e a pista no nome. Vincular: remédio SEM
//   código cujo nome/princípio casa com UM item da base leve (`linkMatchesFor`: cobre todas as palavras conhecidas; vários = ruído — C-2a-11/12).
//   A base leve só é lida com candidato (C-2a-1); zero índice CMED aqui (E-R5-4). Dispensas no aparelho:
//     catalog-link-dismissed:<id>            ("Não é" — loja da 119, `catalogLinkStore`)
//     dosiq:form-mismatch-dismissed:<id>     ("Está certo")

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classifyCoherence, coherenceKey, formMismatch, normalizeText, pickSetupCard, strengthEntriesFor, SETUP_WINDOW_DAYS, getTodayLocal } from '@dosiq/core'
import type { CoherenceVerdict, FormMismatch, SetupCardPick, StrengthEntry } from '@dosiq/core'
import { nativeStorageAdapter } from '@platform/storage/nativeStorageAdapter'
import { useCmedStrengths } from '@shared/hooks/useCmedStrengths'
import { useMedicineDatabase } from '@shared/hooks/useMedicineDatabase'
import { getRecentMedicines } from '@dashboard/services/dashboardService'
import { dismissCatalogLink, isCatalogLinkDismissed } from '@medications/services/catalogLinkStore'
import { linkMatchesFor } from '@medications/utils/catalogMatch'

/** AC6.4e: espera máxima pelo sidecar antes de escolher o card. */
export const SETUP_VERDICT_TIMEOUT_MS = 2000

const CONFIRMED_PREFIX = 'dosiq:setup-confirmed:'
const SCHEDULE_PREFIX = 'dosiq:setup-schedule:'
export const FORM_DISMISSED_PREFIX = 'dosiq:form-mismatch-dismissed:'
export function scheduleKey(p: any): string {
  const days = Array.isArray(p?.weekdays) ? [...p.weekdays].sort().join(',') : ''
  const times = Array.isArray(p?.time_schedule) ? [...p.time_schedule].sort().join(',') : ''
  return `${SCHEDULE_PREFIX}${p?.id}:${p?.frequency ?? ''}|${p?.interval_days ?? ''}|${days}|${times}|${p?.start_date ?? ''}`
}

/**
 * Remédio que NUNCA foi configurado/usado (alvo do "Falta 1 passo"): sem tratamento, sem etapa de escada e sem
 * dose registrada. `protocols` ausente ⇒ não entra (regra da 125); etapas/doses ausentes = nenhuma (vêm do
 * mesmo select; o embed devolve sempre array).
 */
export function isNeverUsedMedicine(m: any): boolean {
  const none = (v: unknown) => v == null || (Array.isArray(v) && v.length === 0)
  return Array.isArray(m?.protocols) && m.protocols.length === 0 && none(m?.titration_steps) && none(m?.medicine_logs)
}

function uniqueById(list: any[]): any[] {
  const seen = new Set<string>()
  return list.filter((p) => p?.id && !seen.has(p.id) && seen.add(p.id))
}

/** Remédios dos tratamentos ativos, um por id. O mapa da Hoje não traz `id`: vem de `medicine_id` (S-4). */
function medicinesOf(protocols: any[]): any[] {
  const seen = new Map<string, any>()
  for (const p of protocols) {
    if (p?.medicine && p.medicine_id && !seen.has(p.medicine_id)) seen.set(p.medicine_id, { ...p.medicine, id: p.medicine_id })
  }
  return [...seen.values()]
}

/** 2a (S-7): o sidecar serve à coerência (injetável) e à forma (qualquer forma) — basta ter registro. */
function needsStrengths(medicines: any[]): boolean {
  return medicines.some((m) => !!m?.anvisa_registration)
}

export interface TodaySetupState {
  /** null enquanto o veredito, as confirmações ou os remédios recentes não chegaram (AC6.4e). */
  card: SetupCardPick | null
  protocol: any | null
  medicine: any | null
  /** AC6.2: o dia/hora deste tratamento já foi confirmado neste aparelho. */
  scheduleConfirmed: boolean
  /** Forças do registro do remédio do card (sidecar); [] quando indisponível. */
  entries: StrengthEntry[]
  /** Vincular: itens da lista que casam com o remédio do card ([] nos outros cards). */
  linkMatches: any[]
  confirmCoherence: () => Promise<void>
  /** "Não é" (FR-041): o convite não volta para este remédio. */
  dismissLink: () => Promise<void>
  /** "Está certo" (AC8.8): a forma cadastrada vale; o aviso não volta para este remédio. */
  confirmForm: () => Promise<void>
  /** `next` = tratamento com a agenda nova (após "Mudar" salvo), para não perguntar de novo. */
  confirmSchedule: (next?: any) => Promise<void>
}

/** Marca local do "Não é" desta sessão (a releitura da loja não desfaz o toque). */
const LINK_TOUCH = 'link-dismissed:'

/** Ids estáveis para deps de memo (a lista nasce nova a cada render). */
const EMPTY: string[] = []

export function useTodaySetup({ data, stale, onScreenProtocolIds = EMPTY }: {
  data: any
  stale: boolean
  /**
   * Tratamentos que a Hoje já mostra (widget + agenda de hoje): não ganham "Tratamento cadastrado"
   * (PO smoke 20/11 — o setup do widget vive no miolo da L1). O Confira continua valendo para eles.
   */
  onScreenProtocolIds?: string[]
}): TodaySetupState {
  // States
  const [stored, setStored] = useState<Record<string, boolean> | null>(null)
  const [recent, setRecent] = useState<any[] | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  // Dispensa do Vincular por remédio (loja da 119); null = ainda lendo.
  const [linkDismissed, setLinkDismissed] = useState<Record<string, boolean> | null>(null)
  // RC6 #971: confirmações desta sessão — a releitura do storage não pode desfazer um toque já dado.
  const touched = useRef(new Set<string>())

  // Memos
  const protocols = useMemo(
    () => uniqueById([...(data?.protocols ?? []), ...(data?.scheduledProtocols ?? [])]),
    [data?.protocols, data?.scheduledProtocols],
  )
  const medicines = useMemo(() => medicinesOf(protocols), [protocols])
  const wantsStrengths = useMemo(() => needsStrengths(medicines), [medicines])
  const strengths = useCmedStrengths({ enabled: wantsStrengths && !stale })
  // Vincular: sem REGISTRO (não arquivado — a Hoje só traz tratamento ativo, S-6). Sem código ⇒ casamento por
  // nome (`linkMatchesFor`); com código e sem registro ⇒ só marca de nome EXATO (C-2a-16, PO 22/11 — o caso
  // mais comum em prod nunca era convidado a vincular) E forma divergente. O nome `uncoded` ficou do 2a original.
  const uncoded = useMemo(() => medicines.filter((m) => !m.anvisa_registration && m.name), [medicines])
  const uncodedKey = uncoded.map((m) => m.id).join(',')
  const linkOpen = useMemo(
    () => (linkDismissed ? uncoded.filter((m) => linkDismissed[m.id] === false) : []),
    [uncoded, linkDismissed],
  )
  // Corrigir forma sem registro: precisa das `forms` da base leve (C-2a-10).
  const needsNameForms = useMemo(
    () => medicines.some((m) => m.therapeutic_class_code && !m.anvisa_registration && m.name),
    [medicines],
  )
  const wantsDatabase = (linkOpen.length > 0 || needsNameForms) && !stale
  const database = useMedicineDatabase({ enabled: wantsDatabase })
  const keys = useMemo(
    () => [
      ...protocols.flatMap((p) => [CONFIRMED_PREFIX + coherenceKey(p, p.medicine ?? {}), scheduleKey(p)]),
      ...medicines.filter((m) => m.therapeutic_class_code).map((m) => FORM_DISMISSED_PREFIX + m.id),
    ],
    [protocols, medicines],
  )
  const keysSignature = keys.join('\n')
  const strengthsSettled = !wantsStrengths || strengths.status === 'ready' || strengths.status === 'unavailable'
  const databaseSettled = !wantsDatabase || database.isReady || !!database.error
  // AC6.4e: o slot só escolhe com sidecar E base leve prontos (ou indisponíveis) — teto 2 s comum.
  const verdictSettled = (strengthsSettled && databaseSettled) || timedOut
  const sidecarReady = strengths.status === 'ready' && !!strengths.strengths && !!strengths.byRegistration

  const verdicts = useMemo(() => {
    const out: Record<string, CoherenceVerdict> = {}
    if (!stored) return out
    for (const p of protocols) {
      const med = p.medicine
      if (!med || stored[CONFIRMED_PREFIX + coherenceKey(p, med)]) continue
      const entries = sidecarReady ? strengthEntriesFor(strengths.strengths!, strengths.byRegistration!, med.anvisa_registration) : null
      out[p.id] = classifyCoherence(p, med, entries)
    }
    return out
  }, [protocols, stored, strengths, sidecarReady])

  // Item de marca da base leve por nome exato (sem acento/caixa); genérico fica de fora (C-2a-10).
  const brandByName = useMemo(() => {
    const out = new Map<string, any>()
    for (const item of (database.items ?? []) as any[]) {
      if (/^gen/i.test(normalizeText(String(item?.regulatoryCategory ?? '')))) continue
      out.set(normalizeText(String(item?.name ?? '')).trim(), item)
    }
    return out
  }, [database.items])

  // FR-042: só remédio COM código (sem código, julgar forma pelo nome seria critério de classe — INV-4).
  // Formas do catálogo = `f` do registro; sem registro, `forms` da marca de mesmo nome; sem nenhum dos dois
  // (genérico, sidecar fora, nome sem item) ⇒ só a pista no nome.
  const formMismatches = useMemo(() => {
    const out: Record<string, FormMismatch | null> = {}
    if (!stored) return out
    for (const m of medicines) {
      if (!m.therapeutic_class_code || stored[FORM_DISMISSED_PREFIX + m.id]) continue
      let forms: Array<string | null> | null = null
      if (m.anvisa_registration) {
        forms = sidecarReady ? strengthEntriesFor(strengths.strengths!, strengths.byRegistration!, m.anvisa_registration).map((e) => e.f) : null
      } else {
        const item = brandByName.get(normalizeText(m.name ?? '').trim())
        forms = Array.isArray(item?.forms) ? item.forms : null
      }
      out[m.id] = formMismatch(m, forms)
    }
    return out
  }, [medicines, stored, strengths, sidecarReady, brandByName])

  const linkMatchesById = useMemo(() => {
    const out: Record<string, any[]> = {}
    if (!database.items) return out
    for (const m of linkOpen) {
      if (m.therapeutic_class_code) {
        // Só com forma divergente: o vínculo vira o veículo da correção e ABSORVE o card de forma. Sem
        // divergência, seriam 47 de 90 em prod "“Rivotril” é o Rivotril?" — fila longa sem nada errado (PO 22/11).
        const brand = brandByName.get(normalizeText(m.name ?? '').trim())
        if (brand && formMismatches[m.id]) out[m.id] = [brand]
        continue
      }
      // PO 22/11 (C-2a-11): só UM casamento vira card ("X é o Y?"); vários ("Vitaminas", "Dipirona") é ruído.
      const found = linkMatchesFor(database.items, m.name, m.active_ingredient)
      if (found.length === 1) out[m.id] = found
    }
    return out
  }, [database.items, linkOpen, brandByName, formMismatches])

  const onScreenKey = onScreenProtocolIds.join(',')
  const card = useMemo(() => {
    // RC6 #973: o mapa resolvido antes (ex.: {} com data nula) não vale para remédio sem código recém-chegado.
    const linkReady = linkDismissed !== null && uncoded.every((m) => m.id in linkDismissed)
    if (!data || stale || !stored || recent === null || !linkReady || !verdictSettled) return null
    const withTreatment = new Set(protocols.map((p) => p.medicine_id))
    const onScreen = new Set(onScreenKey ? onScreenKey.split(',') : [])
    const input = {
      protocols,
      loggedProtocolIds: (data.logs ?? []).map((l: any) => l?.protocol_id).filter(Boolean),
      verdicts,
      // C-2a-16 (PO 22/11): um card de identidade por remédio — vínculo pendente ABSORVE a forma (a conferência
      // do vínculo já mostra "Forma: antes → depois"; a caixa vence, FR-039). "Não é" ⇒ a forma volta.
      formMismatches: Object.fromEntries(Object.entries(formMismatches).filter(([id]) => !linkMatchesById[id])),
      linkCandidateIds: Object.keys(linkMatchesById),
      // Sem NENHUM tratamento (pausado conta — smoke 20/11). Campo ausente (resposta antiga) ⇒ não entra.
      // Fix smoke 124 B (24/11): etapa de escada (passada ou futura) ou com dose registrada ⇒ já foi
      // configurado/usado; parar por indicação clínica não é "falta 1 passo".
      orphanMedicines: recent.filter((m) => !withTreatment.has(m.id) && isNeverUsedMedicine(m)),
      today: data.localDay ?? getTodayLocal(),
    }
    const pick = pickSetupCard(input)
    if (pick?.kind !== 'cadastrado' || !onScreen.has(pick.protocolId)) return pick
    // Confira já foi descartado acima (pick seria ele) ⇒ refazer sem os da tela só muda o "cadastrado".
    return pickSetupCard({ ...input, protocols: protocols.filter((p) => !onScreen.has(p.id)) })
  }, [data, stale, stored, recent, linkDismissed, verdictSettled, protocols, verdicts, formMismatches, linkMatchesById, onScreenKey])

  const protocol = useMemo(
    () => (card && card.kind !== 'falta' ? protocols.find((p) => p.id === card.protocolId) ?? null : null),
    [card, protocols],
  )
  const medicine = useMemo(
    // O mapa de remédios da Hoje (`getMedicinesData`) NÃO traz `id` — vem de `medicine_id` do tratamento
    // (smoke 20/11: "Escolher a caixa" gravava em `undefined`, 22P02).
    () => (card?.kind === 'falta'
      ? (recent ?? []).find((m) => m.id === card.medicineId) ?? null
      : protocol?.medicine ? { ...protocol.medicine, id: protocol.medicine_id } : null),
    [card, recent, protocol],
  )
  const entries = useMemo(() => {
    if (!medicine?.anvisa_registration || strengths.status !== 'ready' || !strengths.strengths || !strengths.byRegistration) return []
    return strengthEntriesFor(strengths.strengths, strengths.byRegistration, medicine.anvisa_registration)
  }, [medicine, strengths])

  const linkMatches = useMemo(
    () => (card?.kind === 'vincular' ? linkMatchesById[card.medicineId] ?? [] : []),
    [card, linkMatchesById],
  )

  // Effects
  useEffect(() => {
    let cancelled = false
    const list = keysSignature ? keysSignature.split('\n') : []
    Promise.all(list.map((k) => nativeStorageAdapter.getItem(k).catch(() => null)))
      .then((values) => {
        if (cancelled) return
        setStored(Object.fromEntries(list.map((k, i) => [k, values[i] === '1' || touched.current.has(k)])))
      })
    return () => {
      cancelled = true
    }
  }, [keysSignature])

  const userId = data?.user?.id ?? null
  const capturedAt = data?.capturedAt ?? null
  useEffect(() => {
    let cancelled = false
    // Offline/sem sessão: o card já é null (stale) — não consulta.
    if (!userId || stale) return
    // Best-effort: falhar aqui só tira o "Falta 1 passo" (nunca a agenda).
    getRecentMedicines(userId, SETUP_WINDOW_DAYS)
      .catch(() => [])
      .then((rows) => {
        if (!cancelled) setRecent(Array.isArray(rows) ? rows : [])
      })
    return () => {
      cancelled = true
    }
  }, [userId, capturedAt, stale])

  useEffect(() => {
    let cancelled = false
    const ids = uncodedKey ? uncodedKey.split(',') : []
    Promise.all(ids.map((id) => isCatalogLinkDismissed(id)))
      .then((values) => {
        if (!cancelled) setLinkDismissed(Object.fromEntries(ids.map((id, i) => [id, values[i] || touched.current.has(LINK_TOUCH + id)])))
      })
    return () => {
      cancelled = true
    }
  }, [uncodedKey])

  useEffect(() => {
    if ((!wantsStrengths && !wantsDatabase) || verdictSettled) return
    const id = setTimeout(() => setTimedOut(true), SETUP_VERDICT_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [wantsStrengths, wantsDatabase, verdictSettled])

  // Handlers

  const remember = useCallback(async (key: string) => {
    touched.current.add(key)
    setStored((prev) => ({ ...(prev ?? {}), [key]: true }))
    try {
      await nativeStorageAdapter.setItem(key, '1')
    } catch {
      // Só nesta sessão: a pergunta volta na próxima abertura (nada se perde no banco).
    }
  }, [])

  const confirmCoherence = useCallback(
    () => (protocol ? remember(CONFIRMED_PREFIX + coherenceKey(protocol, protocol.medicine ?? {})) : Promise.resolve()),
    [protocol, remember],
  )
  const dismissLink = useCallback(async () => {
    if (card?.kind !== 'vincular') return
    const id = card.medicineId
    touched.current.add(LINK_TOUCH + id)
    setLinkDismissed((prev) => ({ ...(prev ?? {}), [id]: true }))
    await dismissCatalogLink(id)
  }, [card])
  const confirmForm = useCallback(
    () => (card?.kind === 'forma' ? remember(FORM_DISMISSED_PREFIX + card.medicineId) : Promise.resolve()),
    [card, remember],
  )
  const confirmSchedule = useCallback(
    (next?: any) => (protocol ? remember(scheduleKey({ ...protocol, ...(next ?? {}) })) : Promise.resolve()),
    [protocol, remember],
  )


  return {
    card,
    protocol,
    medicine,
    scheduleConfirmed: !!(protocol && stored?.[scheduleKey(protocol)]),
    entries,
    linkMatches,
    confirmCoherence,
    dismissLink,
    confirmForm,
    confirmSchedule,
  }
}

export default useTodaySetup
