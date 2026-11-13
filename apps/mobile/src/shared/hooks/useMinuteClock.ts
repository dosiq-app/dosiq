// useMinuteClock — "agora" como ESTADO, para telas que mostram horário relativo (AP-366).
//
// Mesmo padrão do relógio do Hoje (103 A, `useTodayData`): tick alinhado ao minuto cheio (horários de
// dose são HH:MM), relógio parado fora do primeiro plano e "agora" atualizado ao voltar. Sem isto, um
// `getNow()` dentro de `useMemo` congela a tela no instante do último cálculo: dose já passada segue
// como "próxima" e "hoje/amanhã" erram depois da meia-noite (RC6 #947).

import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { getNow } from '@dosiq/core'

const MINUTE_MS = 60 * 1000

export function useMinuteClock(): Date {
  const [now, setNow] = useState<Date>(() => getNow())

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    const tick = () => setNow(getNow())

    const stopClock = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
      timeoutId = null
      intervalId = null
    }

    const startClock = () => {
      stopClock()
      const msToNextMinute = MINUTE_MS - (getNow().getTime() % MINUTE_MS)
      timeoutId = setTimeout(() => {
        tick()
        intervalId = setInterval(tick, MINUTE_MS)
      }, msToNextMinute)
    }

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        stopClock()
        return
      }
      tick()
      startClock()
    })

    if (AppState.currentState === 'active') startClock()

    return () => {
      subscription.remove()
      stopClock()
    }
  }, [])

  return now
}
