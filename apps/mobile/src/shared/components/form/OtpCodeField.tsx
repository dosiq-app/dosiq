// OtpCodeField.tsx — campo do código de confirmação por e-mail (spec 123 §Campo do código).
// Compartilhado entre o cadastro e a recuperação de senha.
//
// Um TextInput real e invisível cobre as 8 posições desenhadas; as posições são só desenho do
// valor dele. SEM `maxLength`: o limite nativo corta o texto colado antes da limpeza ("1997 1511"
// viraria 7 dígitos — E-6). A limpeza mantém só dígitos e fica com os 8 primeiros.
// O disparo automático só acontece quando os 8 dígitos chegam de uma vez (colar ou sugestão do
// teclado). O app nunca lê a área de transferência sozinho (RC-SEC S-7).

import { useRef } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { colors, borderRadius, typography } from '@shared/styles/tokens'

export const OTP_LENGTH = 8

/** Só dígitos, no máximo os 8 primeiros. */
export function normalizeOtp(text: string | null | undefined): string {
  if (typeof text !== 'string') return ''
  return text.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

interface OtpCodeFieldProps {
  value: string
  onChange: (value: string) => void
  /** Chamado quando os 8 dígitos chegam de uma vez (colar/preenchimento automático). */
  onComplete?: (code: string) => void
  editable?: boolean
  hasError?: boolean
}

export default function OtpCodeField({
  value,
  onChange,
  onComplete,
  editable = true,
  hasError = false,
}: OtpCodeFieldProps) {
  const inputRef = useRef<TextInput>(null)

  function handleChangeText(text: string) {
    const next = normalizeOtp(text)
    const jump = next.length - value.length
    onChange(next)
    if (onComplete && next.length === OTP_LENGTH && jump >= 2) onComplete(next)
  }

  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '')
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1)

  return (
    <Pressable
      style={styles.wrapper}
      onPress={() => inputRef.current?.focus()}
      accessible={false}
      importantForAccessibility="no"
    >
      <View style={styles.row} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        {cells.map((digit, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              i === activeIndex && editable && styles.cellActive,
              hasError && styles.cellError,
            ]}
          >
            <Text style={styles.digit}>{digit}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        editable={editable}
        caretHidden
        selection={{ start: value.length, end: value.length }}
        accessibilityLabel="Código de 8 dígitos"
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  cell: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: {
    borderColor: colors.brand.primary,
  },
  cellError: {
    borderColor: colors.status.error,
  },
  digit: {
    fontSize: 22,
    color: colors.text.primary,
    fontFamily: typography.fontFamily.bold || 'System',
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.011,
    color: 'transparent',
  },
})
