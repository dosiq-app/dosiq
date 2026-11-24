/**
 * trackedMeasure — qual medida um tratamento acompanha (spec 100 · ADR-121).
 *
 * Puro, sem I/O. Dois papéis distintos:
 * - `inferMeasure`: matriz classe CMED → medida, roda SÓ no form (criar/editar) para pré-selecionar
 *   o campo. Nunca em leitura, sync ou migração (FR-005, INV-1).
 * - `effectiveMeasure`: o que o runtime (pedido pós-dose, card) obedece. Lê só `tracked_measure` +
 *   `frequency` do tratamento — a classe do medicamento não entra no fluxo de dose (RC3 E-2).
 *
 * Informativo (ADR-062): decide QUAL medida pedir/mostrar, nunca interpreta o valor medido.
 */
import { THERAPEUTIC_CLASS_CODE_REGEX } from '../schemas/medicineSchema'
import { TRACKED_MEASURES, type TrackedMeasure } from '../schemas/protocolSchema'
import { doseCadence, weeklyCadenceDays, type DoseCadence } from '../utils/doseCadence'

export type Measure = Exclude<TrackedMeasure, 'nenhum'>

/**
 * Matriz FR-002 (PO 2026-10-29). Prefixo mais longo vence: GLP-1/antiobesidade (`A10S`, `A10X9`)
 * ganham de `A10` (antidiabéticos). Códigos EphMRA do índice CMED (sem zero à esquerda: `C7A`).
 */
export const MEASURE_CLASS_MATRIX: ReadonlyArray<readonly [prefix: string, measure: Measure]> = [
  ['A10', 'glicemia'],
  ['A8A', 'peso'],
  ['A10S', 'peso'],
  ['A10X9', 'peso'],
  ['C2', 'pressao_arterial'],
  ['C3', 'pressao_arterial'],
  ['C7', 'pressao_arterial'],
  ['C8', 'pressao_arterial'],
  ['C9', 'pressao_arterial'],
]

/**
 * Wedge 2026 (spec 115 · INV-4): GLP-1/antiobesidade por prefixo de `therapeutic_class_code`,
 * nunca por texto de classe ("Antidiabeticos" junta GLP-1 e insulina). Espelhada literalmente na
 * RPC `get_admin_growth_analytics` — o `wedgeParity.test.ts` barra divergência.
 */
export const WEDGE_CLASS_PREFIXES: ReadonlyArray<string> = ['A10S', 'A10X9', 'A8A']

/**
 * Recortes do painel Crescimento & Wedge (spec 118 · FR-001). `since` é o corte por data de
 * cadastro (`auth.users.created_at >= since`), em horário de Brasília. Só a chave trafega na URL;
 * o handler resolve a data aqui, nunca aceita data livre do cliente.
 */
export const GROWTH_COHORTS = {
  v034: { label: 'Pós-v0.34', since: '2026-10-22T00:00:00-03:00' },
} as const

export type GrowthCohortKey = keyof typeof GROWTH_COHORTS

/** Abaixo deste denominador o painel avisa amostra pequena (spec 118 · FR-005). */
export const SMALL_SAMPLE_THRESHOLD = 30

export type WedgeBucket = 'glp1_antiobesidade' | 'antidiabeticos_outros' | 'outras' | 'sem_codigo'

/** Bucket do wedge de um código de classe (mesma regra da RPC). */
export function classifyWedge(code: string | null | undefined): WedgeBucket {
  const normalized = normalizeClassCode(code)
  if (normalized === null) return 'sem_codigo'
  if (WEDGE_CLASS_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return 'glp1_antiobesidade'
  if (normalized.startsWith('A10')) return 'antidiabeticos_outros'
  return 'outras'
}

/** Trim + maiúsculas; `null` se vazio ou fora do formato do CHECK do banco. */
export function normalizeClassCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null
  const normalized = code.trim().toUpperCase()
  return THERAPEUTIC_CLASS_CODE_REGEX.test(normalized) ? normalized : null
}

/** Regra da 069: tratamento semanal acompanha peso; o resto, nada. */
function fallbackMeasure(frequency: string | null | undefined): TrackedMeasure {
  return frequency === 'semanal' ? 'peso' : 'nenhum'
}

export function inferMeasure({
  classCode,
  frequency,
}: {
  classCode: string | null | undefined
  frequency: string | null | undefined
}): TrackedMeasure {
  const code = normalizeClassCode(classCode)
  if (code === null) return fallbackMeasure(frequency)
  let best: readonly [string, Measure] | null = null
  for (const entry of MEASURE_CLASS_MATRIX) {
    if (code.startsWith(entry[0]) && (best === null || entry[0].length > best[0].length)) best = entry
  }
  return best === null ? fallbackMeasure(frequency) : best[1]
}

export type EffectiveMeasure = TrackedMeasure | { missing: true }

const TRACKED_SET = new Set<string>(TRACKED_MEASURES)

/**
 * Medida que o runtime obedece. Chave AUSENTE (select sem a coluna — RC3 E-1) ou valor fora do
 * enum ⇒ `{ missing: true }`: o chamador falha fechado (não pede, avisa no Sentry), nunca cai no
 * fallback — pedir peso a quem escolheu "nenhum" é pior que não pedir.
 */
export function effectiveMeasure(protocol: { frequency?: string | null; tracked_measure?: unknown }): EffectiveMeasure {
  if (!Object.prototype.hasOwnProperty.call(protocol, 'tracked_measure')) return { missing: true }
  const value = protocol.tracked_measure
  if (value === null) return fallbackMeasure(protocol.frequency)
  if (typeof value === 'string' && TRACKED_SET.has(value)) return value as TrackedMeasure
  return { missing: true }
}

/** Perfil da Hoje (spec 121 FR-001): `wedge` = todos os ativos GLP-1/antiobesidade · `misto` = algum. */
export type WedgeProfile = 'wedge' | 'misto' | 'nenhum'

export interface WedgeProfileProtocol {
  id: string
  medicine_id: string | null | undefined
  start_date?: string | null
}

export interface WedgeProfileSummary {
  profile: WedgeProfile
  /** Tratamento wedge iniciado mais recentemente (FR-023: o módulo é dele). `null` se não há wedge. */
  wedgeProtocolId: string | null
  /** Início mais antigo entre os tratamentos wedge ativos (YYYY-MM-DD): a jornada GLP-1 do paciente,
   *  início da janela "Tratamento" do peso (smoke 121 A). `null` se não há wedge ou data. */
  wedgeStart: string | null
}

/**
 * Agrega `classifyWedge` sobre os tratamentos ATIVOS do usuário (o chamador filtra). Medicamento
 * ausente do mapa ou sem código ⇒ não-wedge (falha para a Hoje atual, nunca para o módulo).
 * Desempate de `start_date` igual: maior `id`, para o mesmo resultado em toda renderização.
 */
export function summarizeWedgeProfile(
  protocols: ReadonlyArray<WedgeProfileProtocol>,
  classCodeByMedicine: Readonly<Record<string, string | null | undefined>>
): WedgeProfileSummary {
  const wedge = protocols.filter(
    (p) => !!p.medicine_id && classifyWedge(classCodeByMedicine[p.medicine_id]) === 'glp1_antiobesidade'
  )
  if (wedge.length === 0) return { profile: 'nenhum', wedgeProtocolId: null, wedgeStart: null }
  const latest = wedge.reduce((a, b) => {
    const sa = a.start_date ?? ''
    const sb = b.start_date ?? ''
    if (sa !== sb) return sb > sa ? b : a
    return b.id > a.id ? b : a
  })
  const starts = wedge.map((p) => p.start_date).filter((d): d is string => !!d).sort()
  return {
    profile: wedge.length === protocols.length ? 'wedge' : 'misto',
    wedgeProtocolId: latest.id,
    wedgeStart: starts[0] ?? null,
  }
}

// ─── 124 A · elegíveis do módulo da Hoje (FR-005/FR-013) ─────────────────────────

/**
 * Cadência que dá L1 a um tratamento (FR-013): wedge = qualquer cadência conhecida (121 C, inclui
 * diário); não wedge = só ≥ 7 dias (`weeklyCadenceDays`). Diário não wedge fica fora (AC-9).
 */
export function trackableCadence(
  protocol: { frequency?: string | null; interval_days?: number | null } | null | undefined,
  isWedge: boolean
): DoseCadence | null {
  if (isWedge) return doseCadence(protocol)
  const days = weeklyCadenceDays(protocol)
  return days ? { kind: 'weekly', days } : null
}

export interface TrackedProfileProtocol extends WedgeProfileProtocol {
  frequency?: string | null
  interval_days?: number | null
}

export interface TrackedEligible {
  id: string
  isWedge: boolean
  cadence: DoseCadence
}

export interface TrackedProfileSummary extends WedgeProfileSummary {
  /** Tratamentos com L1 (FR-013), na ordem recebida. A fatia B escolhe entre eles. */
  eligible: TrackedEligible[]
  /** Tratamento do módulo na fatia A: o wedge mais recente; sem wedge, o não wedge elegível iniciado
   *  mais recentemente (empate ⇒ maior `id`). `null` ⇒ sem módulo. */
  moduleProtocolId: string | null
  moduleIsWedge: boolean
}

function latestStarted<T extends { id: string; start_date?: string | null }>(list: readonly T[]): T | null {
  if (list.length === 0) return null
  return list.reduce((a, b) => {
    const sa = a.start_date ?? ''
    const sb = b.start_date ?? ''
    if (sa !== sb) return sb > sa ? b : a
    return b.id > a.id ? b : a
  })
}

/**
 * Perfil da Hoje com a elegibilidade da 124 (FR-005/FR-013). Campos do wedge = `summarizeWedgeProfile`
 * intacto (PO-6). Wedge sem cadência conhecida segue com o módulo (121), só não entra em `eligible`.
 */
export function summarizeTrackedProfile(
  protocols: ReadonlyArray<TrackedProfileProtocol>,
  classCodeByMedicine: Readonly<Record<string, string | null | undefined>>
): TrackedProfileSummary {
  const wedge = summarizeWedgeProfile(protocols, classCodeByMedicine)
  const eligible: TrackedEligible[] = []
  const nonWedge: TrackedProfileProtocol[] = []
  for (const p of protocols) {
    const isWedge = !!p.medicine_id && classifyWedge(classCodeByMedicine[p.medicine_id]) === 'glp1_antiobesidade'
    const cadence = trackableCadence(p, isWedge)
    if (!cadence) continue
    eligible.push({ id: p.id, isWedge, cadence })
    if (!isWedge) nonWedge.push(p)
  }
  if (wedge.wedgeProtocolId) return { ...wedge, eligible, moduleProtocolId: wedge.wedgeProtocolId, moduleIsWedge: true }
  return { ...wedge, eligible, moduleProtocolId: latestStarted(nonWedge)?.id ?? null, moduleIsWedge: false }
}
