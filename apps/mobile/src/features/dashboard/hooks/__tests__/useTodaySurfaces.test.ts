// useTodaySurfaces — 128 D (PO-D1): resolver o aviso principal não esconde o companheiro que já
// estava na tela, sem precisar ir ao segundo plano (nenhum evento de AppState é disparado aqui).
import { describe, it, expect, afterEach } from '@jest/globals'

jest.mock('@dashboard/hooks/useTodayAlertDismissals', () => ({
  useTodayAlertDismissals: () => ({ isDismissed: () => false, dismiss: jest.fn() }),
}))

import { renderHook } from '@testing-library/react-native'
import { useTodaySurfaces, type TodaySurfacesArgs } from '../useTodaySurfaces'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const args = (over: Partial<TodaySurfacesArgs> = {}): TodaySurfacesArgs => ({
  userId: 'u1',
  hasHero: false,
  push: { usable: false, snoozed: false, remindable: true },
  oem: { eligible: true, dismissed: false, reason: 'restricted' },
  otaReady: false,
  stockUpsellVisible: false,
  nudge: null,
  stockAlerts: [],
  supplyNotices: [],
  protocols: [],
  ...over,
})

describe('useTodaySurfaces — 128 D', () => {
  it('principal resolvido ⇒ companheiro visível sobe a principal no mesmo foreground', () => {
    const { result, rerender } = renderHook((p: TodaySurfacesArgs) => useTodaySurfaces(p), { initialProps: args() })
    const first = result.current.alert?.key
    const second = result.current.companion?.key
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    // Resolve o principal (push liga ou bateria resolvida) — o outro segue ativo.
    const resolved =
      first === 'push'
        ? args({ push: { usable: true, snoozed: false, remindable: true } })
        : args({ oem: { eligible: false, dismissed: false, reason: null } })
    rerender(resolved)
    rerender(resolved)
    expect(result.current.alert?.key).toBe(second)
  })

  it('alerta inédito depois da resolução espera o próximo foreground', () => {
    const { result, rerender } = renderHook((p: TodaySurfacesArgs) => useTodaySurfaces(p), {
      initialProps: args({ oem: { eligible: false, dismissed: false, reason: null } }),
    })
    expect(result.current.alert?.key).toBe('push')
    const next = args({ push: { usable: true, snoozed: false, remindable: true }, otaReady: true })
    rerender(next)
    rerender(next)
    expect(result.current.alert).toBeNull()
  })
})
