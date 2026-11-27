import type { CmedIndexLoadInfo } from '@shared/hooks/useCmedIndex'

// Payload único do `medicine_index_loaded` (busca e scanner), sem `surface` (o emissor declara,
// contrato 092). `duration_ms`/`source`/`status`/`row_count` mantêm o significado da série
// histórica; as fases são aditivas e só vão quando rodaram.
export function indexLoadedPayload(info: CmedIndexLoadInfo): Record<string, string | number> {
  const payload: Record<string, string | number> = {
    source: info.source,
    duration_ms: info.durationMs,
    status: info.status,
    row_count: info.rowCount,
  }
  const phases: [string, number | undefined][] = [
    ['yield_ms', info.yieldMs],
    ['read_ms', info.readMs],
    ['parse_ms', info.parseMs],
    ['fetch_ms', info.fetchMs],
    ['decode_ms', info.decodeMs],
    ['ean_ms', info.eanMs],
    ['write_ms', info.writeMs],
  ]
  for (const [key, value] of phases) {
    if (typeof value === 'number') payload[key] = value
  }
  return payload
}
