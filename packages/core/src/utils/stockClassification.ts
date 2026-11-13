/**
 * stockClassification.ts — em que seção da aba Estoque cada medicamento aparece (spec 117 Fatia B).
 *
 * UMA função decide, por medicamento, primeira regra que casa (FR-005, INV-2):
 *   1. `in_use`    — algum tratamento ativo, não arquivado, no período hoje (`isProtocolInPeriod`,
 *                    NUNCA o predicado estrito do gerador: semanal em dia sem dose segue "em uso").
 *   2. `scheduled` — (a) tratamento ativo com início futuro; (b) medicamento da PRÓXIMA troca de uma
 *                    escada em andamento (mesma regra da 105); (c) etapa futura mais distante, só se
 *                    já tem saldo (FR-006: listar todas = ruído nas escadas de GLP-1).
 *   3. `inactive`  — tratamento pausado (`active === false`, não encerrado) com ou sem saldo; ou
 *                    saldo > 0 sem tratamento vivo (órfão/encerrado).
 *   4. fora da aba — sem nada disso (órfão ou encerrado sem saldo).
 *
 * Pura, sem I/O e sem relógio: `today` e `tz` vêm de quem chama. Nenhuma escrita (INV-4): a etapa
 * futura NÃO vira tratamento — vira um "protocolo de contagem" efêmero, só para o saldo ser contado
 * em doses/dias a partir do início (AC-4.4), que nunca sai desta leitura.
 *
 * `steps === null` (leitura das etapas falhou): sem Programado por etapa — dado ausente não inventa
 * seção nem data (INV-2 da 105). As outras regras seguem.
 */

import { isProtocolActiveOnDate as isProtocolInPeriod } from './dateUtils'
import { addCalendarDays, localDateOfInstant, type RunwayStep } from './stockRunway'

export type StockSection = 'in_use' | 'scheduled' | 'inactive'

export interface ClassifiableProtocol {
  id: string
  name?: string | null
  /** NULLABLE no banco: só `false` explícito é inativo (AP-289). */
  active?: boolean | null
  start_date?: string | null
  end_date?: string | null
  archived_at?: string | null
  medicine_id?: string | null
  frequency?: string | null
  interval_days?: number | null
  time_schedule?: string[] | null
  dosage_per_intake?: number | null
  intake_unit?: string | null
  [key: string]: unknown
}

export interface ClassifiableMedicine {
  id: string
  totalQuantity: number
  protocols?: ClassifiableProtocol[] | null
}

export interface ScheduledInfo {
  /** `future_start`: tratamento próprio começa adiante · `next_step`/`distant_step`: etapa de escada. */
  kind: 'future_start' | 'next_step' | 'distant_step'
  /** Data local de início (YYYY-MM-DD) ou null (etapa de avanço manual / contínua — sem previsão). */
  startsOn: string | null
  /** Número da etapa como a timeline mostra (`index+1` por `position`); null fora de escada. */
  stepNumber: number | null
  /** Nome do tratamento da escada — TEXTO DE TELA, nunca prop de evento (CON-034). */
  treatmentName: string | null
  /** Protocolos para contar o saldo a partir do início (efêmeros na etapa — nunca gravados). */
  countingProtocols: ClassifiableProtocol[]
  /** Data em que a contagem vale (`startsOn` no início futuro; hoje na etapa). */
  countAsOf: string
}

export interface StockClassification {
  medicineId: string
  section: StockSection
  /** Tratamentos que contam como "em uso" hoje (só em `in_use`). */
  inUseProtocols: ClassifiableProtocol[]
  /** Pausado (só em `inactive`): tratamento com `active === false` ainda não encerrado. */
  paused: boolean
  scheduled: ScheduledInfo | null
}

const LIVE_STEP_STATUSES = new Set(['current', 'pending_confirmation'])

const isLive = (p: ClassifiableProtocol) => p != null && !p.archived_at
const isOn = (p: ClassifiableProtocol) => p.active !== false
const isEnded = (p: ClassifiableProtocol, today: string) => Boolean(p.end_date) && (p.end_date as string) < today

function isInUse(p: ClassifiableProtocol, today: string): boolean {
  return isLive(p) && isOn(p) && isProtocolInPeriod(p as Parameters<typeof isProtocolInPeriod>[0], today)
}

/** Candidato a Programado: menor data vence; sem data por último; empate ⇒ o primeiro visto. */
function earlier(a: ScheduledInfo | null, b: ScheduledInfo): ScheduledInfo {
  if (!a) return b
  if (a.startsOn === null) return b.startsOn === null ? a : b
  if (b.startsOn === null) return a
  return b.startsOn < a.startsOn ? b : a
}

/** Protocolo de contagem da etapa: cadência do tratamento da escada + dose/unidade da etapa. */
function countingProtocolOf(ladder: ClassifiableProtocol, step: RunwayStep): ClassifiableProtocol {
  return {
    ...ladder,
    id: `step:${String(step.id ?? `${step.titration_id}:${step.position}`)}`,
    medicine_id: step.medicine_id,
    dosage_per_intake: step.dose ?? null,
    intake_unit: step.intake_unit ?? null,
    active: true,
    start_date: null,
    end_date: null,
    archived_at: null,
  }
}

/**
 * Candidatos a Programado vindos das escadas em andamento (FR-006 b/c), por medicamento.
 * Escada em andamento = etapa viva cujo tratamento está em uso hoje (escada pausada não programa).
 */
function ladderCandidates(
  inUseById: Map<string, ClassifiableProtocol>,
  steps: RunwayStep[],
  tz: string,
  today: string,
): Map<string, ScheduledInfo[]> {
  const out = new Map<string, ScheduledInfo[]>()
  const push = (medicineId: string, info: ScheduledInfo) => {
    const list = out.get(medicineId) ?? []
    list.push(info)
    out.set(medicineId, list)
  }
  for (const live of steps) {
    if (!LIVE_STEP_STATUSES.has(live.status) || !live.protocol_id) continue
    const ladder = inUseById.get(live.protocol_id)
    if (!ladder) continue
    const ordered = steps.filter((s) => s.titration_id === live.titration_id).sort((a, b) => a.position - b.position)
    const liveIdx = ordered.indexOf(live)
    // Data prevista: caminha da vigente (`started_at + duration_days`), como a timeline (TitrationTimeline).
    const liveStart = localDateOfInstant(live.started_at ?? null, tz)
    const liveDur = Number(live.duration_days)
    let projected: string | null = liveStart && Number.isInteger(liveDur) && liveDur > 0 ? addCalendarDays(liveStart, liveDur) : null
    for (let i = liveIdx + 1; i < ordered.length; i++) {
      const s = ordered[i]
      const startsOn = projected
      const dur = Number(s.duration_days)
      projected = projected && Number.isInteger(dur) && dur > 0 ? addCalendarDays(projected, dur) : null
      if (s.status === 'completed' || s.medicine_id === live.medicine_id) continue
      push(s.medicine_id, {
        // "Próxima troca" = a etapa SEGUINTE imediata usa outro medicamento (mesma regra da 105,
        // `nextStepSwitchMedicineId`). Qualquer outra etapa futura é distante (só entra com saldo).
        kind: i === liveIdx + 1 ? 'next_step' : 'distant_step',
        // Data no passado (escada atrasada) ⇒ "começa" vira hoje: não se promete o que já passou.
        startsOn: startsOn && startsOn < today ? today : startsOn,
        stepNumber: i + 1,
        treatmentName: ladder.name ?? null,
        countingProtocols: [countingProtocolOf(ladder, s)],
        countAsOf: today,
      })
    }
  }
  return out
}

/**
 * Classifica os medicamentos da aba Estoque (FR-005..007).
 * @returns uma entrada por medicamento que APARECE na aba (os de fora não vêm), na ordem de entrada.
 */
export function classifyStockMedicines(params: {
  medicines: ClassifiableMedicine[] | null | undefined
  steps: RunwayStep[] | null | undefined
  today: string
  tz: string
}): StockClassification[] {
  const { today, tz } = params
  const medicines = params.medicines ?? []

  const inUseByMedicine = new Map<string, ClassifiableProtocol[]>()
  const inUseById = new Map<string, ClassifiableProtocol>()
  for (const m of medicines) {
    const own = (m.protocols ?? []).filter((p) => isInUse(p, today))
    inUseByMedicine.set(m.id, own)
    for (const p of own) inUseById.set(p.id, { ...p, medicine_id: p.medicine_id ?? m.id })
  }

  const ladder = Array.isArray(params.steps) ? ladderCandidates(inUseById, params.steps, tz, today) : new Map<string, ScheduledInfo[]>()

  const out: StockClassification[] = []
  for (const m of medicines) {
    const qty = Number(m.totalQuantity) || 0
    const live = (m.protocols ?? []).filter(isLive)
    const inUse = inUseByMedicine.get(m.id) ?? []
    if (inUse.length > 0) {
      out.push({ medicineId: m.id, section: 'in_use', inUseProtocols: inUse, paused: false, scheduled: null })
      continue
    }

    let scheduled: ScheduledInfo | null = null
    const future = live.filter((p) => isOn(p) && Boolean(p.start_date) && (p.start_date as string) > today)
    if (future.length > 0) {
      const startsOn = future.map((p) => p.start_date as string).sort()[0]
      scheduled = {
        kind: 'future_start',
        startsOn,
        stepNumber: null,
        treatmentName: null,
        countingProtocols: future.map((p) => ({ ...p, medicine_id: p.medicine_id ?? m.id })),
        countAsOf: startsOn,
      }
    }
    for (const cand of ladder.get(m.id) ?? []) {
      // Etapa distante só com saldo (FR-006): sem saldo é ruído.
      if (cand.kind === 'distant_step' && !(qty > 0)) continue
      scheduled = earlier(scheduled, cand)
    }
    if (scheduled) {
      out.push({ medicineId: m.id, section: 'scheduled', inUseProtocols: [], paused: false, scheduled })
      continue
    }

    const paused = live.some((p) => p.active === false && !isEnded(p, today))  // vigency-gate: ok — rótulo PAUSADO da seção (listagem), não consumo; a previsão usa isProtocolVigentOn
    if (paused || qty > 0) {
      out.push({ medicineId: m.id, section: 'inactive', inUseProtocols: [], paused, scheduled: null })
    }
  }
  return out
}
