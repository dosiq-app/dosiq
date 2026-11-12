// resolvedDoseStore.ts — ocorrências resolvidas NESTE aparelho (spec 082 D2 · C-35)
//
// O registro in-app cancela alarme + superfície, mas um arme em voo (derive do bridge, boundary
// entregue, reconcile do alarme) que leu a dose ainda `pending` pode terminar DEPOIS do cancel e
// re-agendar o boundary — smoke 054 C-35: `taken` 22:25:02, boundary `late` 22:34:00. Esta marca é
// conferida pela superfície imediatamente antes de exibir/agendar, então o arme atrasado vira no-op.
//
// AsyncStorage (vale também no headless), mapa `{ [doseInstanceId]: epochMs }`, TTL 24 h. Desfazer o
// registro desmarca. Best-effort em tudo: falha de leitura ⇒ "não resolvida" (comportamento anterior).

import { createTtlMapStore } from '@platform/storage/ttlMapStore'

export const RESOLVED_DOSES_KEY = '@dosiq/resolved-doses'
export const RESOLVED_DOSE_TTL_MS = 24 * 60 * 60 * 1000

// Escritas SERIALIZADAS (na fábrica): ler-mutar-gravar do mapa inteiro em paralelo (registro em lote +
// pulo) perdia a marca de quem gravou primeiro — e marca perdida reabre o C-35 (RC6 #930).
// Best-effort: sem a marca, vale só o cancel imediato (comportamento anterior).
const store = createTtlMapStore({ key: RESOLVED_DOSES_KEY, ttlMs: RESOLVED_DOSE_TTL_MS })

/** Marca as ocorrências como resolvidas (registro aceito pelo servidor). */
export async function markDosesResolved(ids: string[], nowMs: number = Date.now()): Promise<void> {
  await store.write((map, at) => {
    for (const id of ids) if (id) map[String(id)] = at
  }, nowMs)
}

/** Retira a marca (desfazer registro: a dose volta a `pending` e a superfície pode voltar). */
export async function unmarkDoseResolved(id: string, nowMs: number = Date.now()): Promise<void> {
  await store.write((map) => {
    delete map[String(id)]
  }, nowMs)
}

/** A ocorrência foi resolvida neste aparelho nas últimas 24 h? Falha ⇒ false. */
export async function isDoseResolved(id: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  if (!id) return false
  return String(id) in (await store.read(nowMs))
}
