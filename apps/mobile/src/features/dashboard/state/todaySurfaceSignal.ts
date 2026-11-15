import { useSyncExternalStore } from 'react'
import type { AlertHome } from '@dashboard/utils/pickTodaySurfaces'

/**
 * Sinal discreto das casas permanentes (spec 120 C · D-6 · PO-120-14 · RC2-C DC-8).
 *
 * Quem escreve é o árbitro da Hoje (`useTodaySurfaceSignal`); quem lê são a aba Estoque, a aba Perfil
 * e os itens do Perfil (Notificações, Bateria). Só PRESENÇA (Set de casas) — nunca contagem
 * (boundary: badge numérico = "+N" disfarçado). Some quando o alerta deixa de existir (o árbitro
 * recalcula e grava de novo); abrir a casa NÃO apaga (DC-8).
 */
/** Diâmetro do ponto (dp) — `SignalDot` e o badge das abas usam o mesmo. */
export const SIGNAL_DOT_SIZE = 8

let homes: ReadonlySet<AlertHome> = new Set()
const listeners = new Set<() => void>()

export function setSignalHomes(next: Iterable<AlertHome>) {
  const set = new Set(next)
  if (set.size === homes.size && [...set].every((h) => homes.has(h))) return
  homes = set
  listeners.forEach((l) => l())
}

export function getSignalHomes(): ReadonlySet<AlertHome> {
  return homes
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** `true` enquanto a casa tiver aviso fora da Hoje (suprimido ou dispensado). */
export function useHomeSignal(home: AlertHome): boolean {
  return useSyncExternalStore(subscribe, () => homes.has(home), () => false)
}

/** Para "Perfil" (aba): qualquer casa do Perfil acesa. */
export function useAnyHomeSignal(list: AlertHome[]): boolean {
  return useSyncExternalStore(subscribe, () => list.some((h) => homes.has(h)), () => false)
}
