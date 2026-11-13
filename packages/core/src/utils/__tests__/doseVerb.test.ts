import { describe, it, expect } from 'vitest'
import { doseVerb } from '../doseVerb'
import { getKnownInjectionSiteLabel } from '../injectionSites'

describe('doseVerb (120 B, D-9)', () => {
  it.each([
    ['comprimido', 'tomar'],
    ['capsula', 'tomar'],
    ['liquido', 'tomar'],
    ['injetavel', 'aplicar'],
    ['pomada', 'aplicar'],
    ['spray', 'usar'],
    ['outro', 'usar'],
  ])('%s ⇒ %s', (presentation, verb) => {
    expect(doseVerb(presentation)).toBe(verb)
  })

  it.each([null, undefined, '', 'INJETAVEL', 'injetável', 'xpto'])('valor fora do enum (%s) ⇒ tomar', (value) => {
    expect(doseVerb(value as string | null | undefined)).toBe('tomar')
  })
})

describe('getKnownInjectionSiteLabel (120 B, RC-SEC S-2)', () => {
  it('sítio canônico ⇒ rótulo do core', () => {
    expect(getKnownInjectionSiteLabel('abdomen_e')).toBe('Abdômen (esquerdo)')
    expect(getKnownInjectionSiteLabel('coxa_d')).toBe('Coxa (direita)')
  })

  it.each([null, undefined, '', 'abdomen', 'ABDOMEN_E', '<script>'])('fora do enum (%s) ⇒ null, nunca o valor cru', (value) => {
    expect(getKnownInjectionSiteLabel(value as string | null | undefined)).toBeNull()
  })
})
