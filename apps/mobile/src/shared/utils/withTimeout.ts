// withTimeout — promise que rejeita após N ms (Hermes-safe; sem AbortController em fn arbitrária).
//
// Extraído do `useMutation` (R-168) para o passo de estoque do onboarding usar o mesmo (066 E, C-4):
// a escrita que nunca responde não pode deixar o botão girando para sempre. A operação original NÃO
// é cancelada — quem chama decide o que fazer se ela terminar depois (ver `OnboardingStockStep`).

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(message ?? `Timeout: operação excedeu ${ms / 1000}s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return withTimeout(promise, ms).then(() => {}, () => {})
}
