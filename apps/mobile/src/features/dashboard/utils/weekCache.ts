// weekCache — último resultado das linhas do módulo da Hoje (spec 124 A, smoke 23/11).
//
// Stale-while-revalidate: a linha nasce com o último dado conhecido e a leitura de rede atualiza por
// baixo, sem indicador. Memória (troca de aba, recarga) + AsyncStorage (abrir o app de novo).
// Chave SEMPRE com o usuário: troca de conta no aparelho nunca herda dado de outra pessoa.
// Falha de leitura/escrita ou JSON corrompido ⇒ sem cache (a linha carrega como antes; nunca trava).
// O dado é o mesmo que a Hoje já guarda no aparelho (useTodayData); não sai do dispositivo.

import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'todayWeekCache:'
const memory = new Map<string, unknown>()

export function weekCacheKey(userId: string, ...parts: Array<string | null | undefined>): string {
  return `${PREFIX}${userId}:${parts.map((p) => p ?? '').join(':')}`
}

/** Leitura síncrona da memória (render). */
export function readWeekCache<T>(key: string | null): T | null {
  return key && memory.has(key) ? (memory.get(key) as T) : null
}

/** Leitura do aparelho (cold start); popula a memória. */
export async function hydrateWeekCache<T>(key: string): Promise<T | null> {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as T
    memory.set(key, value)
    return value
  } catch {
    return null
  }
}

export function writeWeekCache(key: string, value: unknown): void {
  memory.set(key, value)
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {})
}

/** Testes. */
export function clearWeekCacheMemory(): void {
  memory.clear()
}
