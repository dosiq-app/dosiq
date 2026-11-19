import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing } from '@shared/styles/tokens'

// `required`: a seção INTEIRA é obrigatória ⇒ o asterisco fica no título, não nos campos (smoke 125 1c).
export default function FormSection({ title = undefined, description = undefined, children, style = undefined, required = false }) {
  return (
    <View style={[styles.wrapper, style]}>
      {/* Título em maiúsculas com estilo eyebrow */}
      {title ? (
        <Text style={styles.title}>
          {title.toUpperCase()}
          {required ? <Text style={styles.asterisk}> *</Text> : null}
        </Text>
      ) : null}

      {/* Descrição (secundária) */}
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}

      {/* Container dos campos com gap entre eles */}
      <View style={styles.fieldsContainer}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing[6],
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.text.muted,
    marginBottom: spacing[2],
  },
  asterisk: {
    color: colors.status.error,
  },
  description: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  fieldsContainer: {
    gap: spacing[4],
  },
})
