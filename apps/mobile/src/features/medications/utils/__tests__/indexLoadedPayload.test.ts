import { indexLoadedPayload } from '../indexLoadedPayload'

describe('indexLoadedPayload — medicine_index_loaded (129 FR-001 · INV-4)', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('mantém os campos históricos e só inclui as fases que rodaram', () => {
    const payload = indexLoadedPayload(
      { source: 'disk', durationMs: 120, status: 'ready', rowCount: 15, yieldMs: 16, readMs: 40, parseMs: 20, decodeMs: 30 },
    )
    expect(payload).toEqual({
      source: 'disk',
      duration_ms: 120,
      status: 'ready',
      row_count: 15,
      yield_ms: 16,
      read_ms: 40,
      parse_ms: 20,
      decode_ms: 30,
    })
  })

  it('fase 0 vai no payload; fase ausente não', () => {
    const payload = indexLoadedPayload({ source: 'network', durationMs: 5, status: 'offline', rowCount: 0, fetchMs: 0 })
    expect(payload.fetch_ms).toBe(0)
    expect(payload).not.toHaveProperty('write_ms')
  })
})
