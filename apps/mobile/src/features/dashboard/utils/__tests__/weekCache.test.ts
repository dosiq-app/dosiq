// weekCache — RC6 #976: hidratação do disco nunca sobrescreve dado mais novo da memória.
import { describe, it, expect, afterEach } from '@jest/globals'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearWeekCacheMemory, hydrateWeekCache, readWeekCache, weekCacheKey, writeWeekCache } from '../weekCache'

afterEach(() => {
  clearWeekCacheMemory()
  jest.restoreAllMocks()
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('weekCache', () => {
  it('chave carrega o usuário', () => {
    expect(weekCacheKey('u1', 'dose', null, 'x')).toBe('todayWeekCache:u1:dose::x')
  })

  it('memória gravada durante o getItem vence o disco', async () => {
    const key = weekCacheKey('u1', 'peso')
    let release: (v: string) => void = () => {}
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(() => new Promise((r) => { release = r as any }))
    const pending = hydrateWeekCache<{ v: number }>(key)
    writeWeekCache(key, { v: 2 })
    release(JSON.stringify({ v: 1 }))
    expect(await pending).toEqual({ v: 2 })
    expect(readWeekCache(key)).toEqual({ v: 2 })
  })

  it('JSON corrompido ⇒ sem cache', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue('{x')
    expect(await hydrateWeekCache('todayWeekCache:u1:z')).toBeNull()
  })
})
