// surfaceEmissionStore.ts — "já emiti (instância, to)" da superfície Android (spec 084 Slice B, OQ-B1).
//
// Prod 2026-11-04: 19 % de pares (instância, `to`) com >1 linha. Três mecanismos (spec §Contexto B):
// M1 corrida entre arms (alarme × app), M2 a mesma entrega processada 2×, M3 card dispensado re-armado
// como 1ª aparição. Um registro persistido (sobrevive à morte do JS) consultado e gravado dentro de
// uma seção exclusiva POR INSTÂNCIA resolve os três (RC3 Slice B, fluxo decidido):
//
//   lock(inst) → registro tem (inst,to)? sim ⇒ no-op
//              → emit() (lê card + enfileira) → true? ⇒ marca  · false/lançou ⇒ NÃO marca
//
// INV-B1: o lock cerca só a DECISÃO de emitir — exibir/agendar ficam fora, com o chamador.
// INV-B2: registro ilegível ⇒ trata como vazio ⇒ emite (duplicata é tolerável, perda não — A3).
// RC3 E1: marcar sem ter enfileirado (sem sessão no headless) transformaria duplicata em perda.
// Processo morre entre enfileirar e marcar ⇒ duplicata na próxima (tolerável); nunca o inverso.
// Lock em memória de módulo: vale para os chamadores do mesmo processo JS; processo novo começa
// sem lock, e o registro persistido cobre M2/M3.

import { createTtlMapStore } from '@platform/storage/ttlMapStore'

export const SURFACE_EMISSIONS_KEY = '@dosiq/surface-emissions'
/** Janela da dose vai até o cap de 120 min; 24 h = mesmo número do resolvedDoseStore (RC3 E8). */
export const SURFACE_EMISSION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Teto de cada operação dentro do lock. Sem ele, UMA promessa nativa que não resolve (notifee,
 * AsyncStorage) prende para sempre toda chamada seguinte da mesma instância — soneca, arm do boot
 * (smoke 084 B, 2026-11-12: tela do alarme travada em `busy` e boot em tela preta). Estourou ⇒
 * a operação é tratada como falha (não marca ⇒ duplicata possível, nunca perda — INV-B2).
 */
export const SURFACE_LOCK_TIMEOUT_MS = 3000

const store = createTtlMapStore({ key: SURFACE_EMISSIONS_KEY, ttlMs: SURFACE_EMISSION_TTL_MS })
const locks = new Map<string, Promise<unknown>>()

const entryKey = (instanceId: string, to: string) => `${instanceId}|${to}`

/** Sinal de estouro do teto, consultado pela `op` antes de efeitos tardios. */
interface LockSignal {
  expired: boolean
}

function withTimeout<T>(op: (signal: LockSignal) => Promise<T>): Promise<T> {
  const signal: LockSignal = { expired: false }
  let timer: ReturnType<typeof setTimeout> | undefined
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      signal.expired = true
      reject(new Error('surface lock timeout'))
    }, SURFACE_LOCK_TIMEOUT_MS)
  })
  return Promise.race([Promise.resolve().then(() => op(signal)), cap]).finally(() => clearTimeout(timer))
}

/**
 * Encadeia `op` atrás da última operação DA MESMA instância; instâncias diferentes não se esperam.
 * Cada `op` tem teto (SURFACE_LOCK_TIMEOUT_MS): a fila nunca fica presa atrás de uma promessa morta.
 */
function withInstanceLock<T>(instanceId: string, op: (signal: LockSignal) => Promise<T>): Promise<T> {
  const prev = locks.get(instanceId) ?? Promise.resolve()
  const capped = () => withTimeout(op)
  const run = prev.then(capped, capped)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  locks.set(instanceId, tail)
  tail.then(() => {
    if (locks.get(instanceId) === tail) locks.delete(instanceId)
  })
  return run
}

export interface EmitOnceInput {
  instanceId: string | null | undefined
  to: string | null | undefined
  nowMs: number
  /** Decide e enfileira. `true` = item gravado na fila; qualquer outra coisa = não marca. */
  emit: () => Promise<boolean | void>
}

/**
 * Emite a transição (instância, `to`) no máximo uma vez por janela. Nunca lança (INV-1).
 * @returns `true` se emitiu e marcou nesta chamada.
 */
export function emitOnce({ instanceId, to, nowMs, emit }: EmitOnceInput): Promise<boolean> {
  if (!instanceId || !to) return Promise.resolve(false)
  const key = entryKey(String(instanceId), String(to))
  return withInstanceLock(String(instanceId), async (signal) => {
    const map = await store.read(nowMs) // ilegível ⇒ {} ⇒ emite (INV-B2)
    if (key in map) return false
    const ok = (await emit()) === true
    // Estourou o teto ⇒ o lock já foi liberado e outro chamador (ex.: `clearEmissions` da soneca)
    // pode ter passado: marcar agora suprimiria o `now` da volta (perda). Não marca ⇒ duplicata, no pior caso.
    if (ok && !signal.expired) await store.write((m, at) => (m[key] = at), nowMs)
    return ok
  }).catch(() => false)
}

/**
 * Esquece as emissões `tos` da instância (volta da soneca, FR-B5/RC3 E2: o `now` da âncora é
 * transição real e precisa re-emitir — FR-003). Serializado com o `emitOnce` da mesma instância.
 * Best-effort: nunca lança.
 */
export function clearEmissions(instanceId: string | null | undefined, tos: string[], nowMs: number): Promise<boolean> {
  if (!instanceId) return Promise.resolve(false)
  const id = String(instanceId)
  return withInstanceLock(id, () =>
    store.write((m) => {
      for (const to of tos) delete m[entryKey(id, to)]
    }, nowMs),
  ).catch(() => false)
}
