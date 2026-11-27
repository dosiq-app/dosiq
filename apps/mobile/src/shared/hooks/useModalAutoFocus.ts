import { useCallback, useEffect, useRef, type RefObject } from 'react'

/**
 * Agenda `ref.current?.focus()` após `delayMs` e limpa o timer pendente no unmount ou ao reagendar.
 *
 * No Android, o `onShow` do `<Modal>` dispara antes de a janela do modal receber foco do sistema;
 * chamar `focus()` imediatamente não abre o teclado, exigindo um pequeno atraso após a exibição.
 */
export function useModalAutoFocus(
  ref: RefObject<{ focus: () => void } | null>,
  delayMs = 150
): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      ref.current?.focus()
    }, delayMs)
  }, [ref, delayMs])
}
