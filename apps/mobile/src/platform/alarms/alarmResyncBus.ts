// alarmResyncBus.js — sinal leve "re-sincronize os alarmes" (Spec 001, FR-006 / insumo E)
//
// Mutações de tratamento (criar/editar/pausar/retomar/excluir) alteram as
// dose_instances futuras (via syncInstancesOnWrite). O AlarmSchedulerBridge
// assina este bus e re-roda o agendamento APÓS a mutação invalidar os snapshots
// — sem acoplar os hooks de tratamento ao scheduler (dep zero, só pub/sub).
//
// Idempotente e best-effort: emitir com o alarme desligado é no-op (o bridge
// ignora quando isAlarmEnabled=false).

import { withTimeout } from '@shared/utils/withTimeout'

type ResyncListener = () => void | Promise<unknown>
const listeners = new Set<ResyncListener>()

/** Teto da espera do salvamento pelo reagendamento (128 C-8). */
export const RESYNC_WAIT_MS = 10_000

/** Assina o sinal de re-sync. Retorna unsubscribe. O listener pode devolver a Promise do re-sync. */
export function onAlarmResync(fn: ResyncListener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Dispara o re-sync em todos os assinantes (chamar após mutação de tratamento). */
export function triggerAlarmResync() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // best-effort — um listener com erro não pode derrubar a mutação
    }
  }
}

/**
 * 128 C-8 (smoke g06/POCO 2026-11-26): re-sync que o SALVAMENTO espera antes do toast. Com o
 * `triggerAlarmResync` solto, o toast "Tratamento atualizado" saía antes do alarme ser reagendado;
 * a pessoa minimizava e travava o celular, o Android parava o JS (timers pausados, rede de app em
 * segundo plano restrita) e a dose recém-editada ficava sem alarme. Aqui o app ainda está aberto.
 * Nunca lança: estourou o teto ⇒ `false` e o salvamento conclui (reserva: foreground + push).
 */
export async function resyncAlarmsAndWait(timeoutMs = RESYNC_WAIT_MS): Promise<boolean> {
  const pending: Promise<unknown>[] = []
  for (const fn of listeners) {
    try {
      pending.push(Promise.resolve(fn()))
    } catch {
      // best-effort — idem triggerAlarmResync
    }
  }
  try {
    await withTimeout(Promise.allSettled(pending), timeoutMs)
    return true
  } catch {
    return false
  }
}
