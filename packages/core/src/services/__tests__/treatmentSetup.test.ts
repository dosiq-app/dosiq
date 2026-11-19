import { describe, expect, it } from 'vitest'
import {
  anchorFromApplication,
  setupDefaults,
  toSetupPresentation,
  checkDosePlausibility,
  denominatorLooksLikePackage,
  describeTreatment,
  nextDoseDate,
  derivePenDose,
  dialDosesFromText,
} from '../treatmentSetup'

// 2026-11-17 é terça-feira.
const TODAY = '2026-11-17'

describe('setupDefaults — FR-021 / FR-008 (PO-125-4, PO-125-5)', () => {
  it('comprimido: dose 1, Todo dia pré-selecionado, unidades sólidas', () => {
    const d = setupDefaults('comprimido')
    expect(d.defaultDose).toBe('1')
    expect(d.preselectedFrequency).toBe('diário')
    expect(d.strengthUnits).toEqual(['mg', 'mcg', 'g', 'ui'])
    expect(d.frequencyOrder).toEqual(['diário', 'dias_alternados', 'semanal', 'mensal_30', 'quando_necessário'])
    expect(d.doseQuestion).toBe('Quantos comprimidos por vez?')
    expect(d.intakeUnits).toEqual([])
  })

  it('cápsula: pergunta no feminino', () => {
    expect(setupDefaults('capsula').doseQuestion).toBe('Quantas cápsulas por vez?')
  })

  it('injetável mg/mL: dose vazia em mg, sem pré-seleção, semanal primeiro', () => {
    const d = setupDefaults('injetavel', 'mg/ml')
    expect(d.defaultDose).toBe('')
    expect(d.doseRequired).toBe(true)
    expect(d.intakeUnits).toEqual(['mg'])
    expect(d.preselectedFrequency).toBeNull()
    expect(d.frequencyOrder[0]).toBe('semanal')
    expect(d.frequencyOrder).toContain('mensal_30')
  })

  it('injetável UI/mL ⇒ UI; sem unidade decidida ⇒ mg e UI (RC5 1b: mL só no form completo)', () => {
    expect(setupDefaults('injetavel', 'ui/ml').intakeUnits).toEqual(['UI'])
    expect(setupDefaults('injetavel', null).intakeUnits).toEqual(['mg', 'UI'])
  })

  it('injetável em mg ou UI por caneta: 1 aplicação, sem pergunta (C-2)', () => {
    for (const unit of ['mg', 'ui']) {
      const d = setupDefaults('injetavel', unit)
      expect(d.doseQuestion).toBeNull()
      expect(d.defaultDose).toBe('1')
      expect(d.intakeUnits).toEqual([])
    }
  })

  it('líquido: gotas obrigatórias sem default', () => {
    const d = setupDefaults('liquido', 'mg/ml')
    expect(d.defaultDose).toBe('')
    expect(d.doseRequired).toBe(true)
    expect(d.intakeUnits).toEqual(['gotas', 'ml'])
    expect(d.frequencyOrder).toEqual(['diário', 'quando_necessário', 'dias_alternados', 'semanal', 'mensal_30'])
  })

  it.each(['pomada', 'spray', 'outro'])('%s: só "un", dosagem opcional (smoke 1c, PO 19/11)', (form) => {
    const d = setupDefaults(form)
    expect(d.strengthUnits).toEqual(['un'])
    expect(d.fixedDosageUnit).toBe('un')
    expect(d.strengthOptional).toBe(true)
  })

  it('comprimido/líquido/injetável: dosagem obrigatória', () => {
    for (const form of ['comprimido', 'capsula', 'liquido', 'injetavel']) expect(setupDefaults(form).strengthOptional).toBe(false)
  })

  it('pomada: unidade fixa un (C-3)', () => {
    const d = setupDefaults('pomada')
    expect(d.fixedDosageUnit).toBe('un')
    expect(d.frequencyOrder[0]).toBe('quando_necessário')
  })

  it('forma desconhecida ou NULL ⇒ outro, sem pré-seleção', () => {
    expect(toSetupPresentation(null)).toBe('outro')
    expect(toSetupPresentation('xarope')).toBe('outro')
    expect(setupDefaults(undefined).preselectedFrequency).toBeNull()
  })

  it('só comprimido/cápsula pré-selecionam frequência', () => {
    for (const p of ['liquido', 'injetavel', 'pomada', 'spray', 'outro']) {
      expect(setupDefaults(p).preselectedFrequency).toBeNull()
    }
  })
})

describe('checkDosePlausibility — casos do handoff §2.1/§2.3 (PO-125-6)', () => {
  // Smoke 18/11 (Ozempic/Wegovy multidose): mL por aplicação = dose ÷ concentração.
  it('Ozempic 1,34 mg/mL com 5 mg ⇒ 3,7 mL numa aplicação', () => {
    const w = checkDosePlausibility({ dose: 5, doseUnit: 'mg', presentation: 'injetavel', concentrationMgPerMl: 1.34 })
    expect(w.map((x) => x.kind)).toEqual(['exceeds_injection_volume'])
    expect(w[0].message).toBe('5 mg daria 3,7 mL numa aplicação — mais do que uma caneta aplica de uma vez. Confira a dose ou a concentração.')
  })
  it('Ozempic 0,5 mg · Wegovy 1,7/2,27 e 2,4/3,2 ⇒ coerentes (≤ 0,75 mL)', () => {
    expect(checkDosePlausibility({ dose: 0.5, doseUnit: 'mg', presentation: 'injetavel', concentrationMgPerMl: 1.34 })).toEqual([])
    expect(checkDosePlausibility({ dose: 1.7, doseUnit: 'mg', presentation: 'injetavel', concentrationMgPerMl: 2.27 })).toEqual([])
    expect(checkDosePlausibility({ dose: 2.4, doseUnit: 'mg', presentation: 'injetavel', concentrationMgPerMl: 3.2 })).toEqual([])
  })
  it('insulina 100 UI/mL: 60 UI ok · 120 UI avisa', () => {
    expect(checkDosePlausibility({ dose: 60, doseUnit: 'UI', presentation: 'injetavel', concentrationMgPerMl: 100 })).toEqual([])
    expect(checkDosePlausibility({ dose: 120, doseUnit: 'UI', presentation: 'injetavel', concentrationMgPerMl: 100 }).map((x) => x.kind)).toEqual(['exceeds_injection_volume'])
  })
  it('acima do conteúdo da caneta ⇒ só exceeds_pen (sem aviso duplicado)', () => {
    const w = checkDosePlausibility({ dose: 15, doseUnit: 'mg', presentation: 'injetavel', penContent: 2.5, denominatorMl: 0.5, concentrationMgPerMl: 5 })
    expect(w.map((x) => x.kind)).toEqual(['exceeds_pen'])
  })
  // Smoke 18/11 (dipirona): gotas 500 mg/mL × solução oral 50 mg/mL.
  it('líquido 500 mg/mL com 15 mL ⇒ costuma ser gotas', () => {
    const w = checkDosePlausibility({ dose: 15, doseUnit: 'ml', presentation: 'liquido', concentrationMgPerMl: 500 })
    expect(w.map((x) => x.kind)).toEqual(['ml_looks_like_drops'])
    expect(w[0].message).toBe('500 mg/mL costuma ser em gotas. Confira: a dose é 15 gotas, ou a concentração é outra?')
  })
  it('líquido 50 mg/mL com 15 mL (solução oral) ⇒ coerente', () => {
    expect(checkDosePlausibility({ dose: 15, doseUnit: 'ml', presentation: 'liquido', concentrationMgPerMl: 50 })).toEqual([])
  })
  it('líquido 500 mg/mL com 2 mL ou em gotas ⇒ coerente', () => {
    expect(checkDosePlausibility({ dose: 2, doseUnit: 'ml', presentation: 'liquido', concentrationMgPerMl: 500 })).toEqual([])
    expect(checkDosePlausibility({ dose: 20, doseUnit: 'gotas', presentation: 'liquido', concentrationMgPerMl: 500 })).toEqual([])
  })
  it('Mounjaro 60 mg com caneta de 2,5 mg ⇒ excede a caneta', () => {
    const w = checkDosePlausibility({ dose: 60, doseUnit: 'mg', presentation: 'injetavel', penContent: 2.5, denominatorMl: 0.5 })
    expect(w.map((x) => x.kind)).toEqual(['exceeds_pen'])
    expect(w[0].message).toBe('O rótulo diz 2,5 mg. Confirma 60 mg?')
  })

  it('Mounjaro "0,6 mg" ⇒ parece mL', () => {
    const w = checkDosePlausibility({ dose: '0,6', doseUnit: 'mg', presentation: 'injetavel', penContent: 2.5, denominatorMl: 0.5 })
    expect(w.map((x) => x.kind)).toEqual(['looks_like_ml'])
    expect(w[0].message).toBe('0,6 parece mL. A dose é em mg? Confira o número com "mg" ao lado.')
  })

  it('Ozivy 0,25 mg em 1,34 mg/mL (multidose, sem denominador) ⇒ nada', () => {
    expect(checkDosePlausibility({ dose: 0.25, doseUnit: 'mg', presentation: 'injetavel' })).toEqual([])
  })

  it('Ozivy com volume 3 mL ⇒ parece tamanho da caneta', () => {
    const w = checkDosePlausibility({ presentation: 'injetavel', denominatorMl: 3 })
    expect(w.map((x) => x.kind)).toEqual(['denominator_looks_like_package'])
    expect(w[0].message).toContain('3 mL parece o tamanho da embalagem')
  })

  it('Amplictil gotas 20 mL ⇒ parece tamanho do frasco; 9,99 não', () => {
    expect(checkDosePlausibility({ presentation: 'liquido', denominatorMl: 20 })[0].message).toBe(
      '20 mL parece o tamanho do frasco. Na caixa, o número depois da barra costuma ser menor.',
    )
    expect(denominatorLooksLikePackage(10, 'liquido')).toBe(true)
    expect(denominatorLooksLikePackage('9,99', 'liquido')).toBe(false)
    expect(denominatorLooksLikePackage(1, 'injetavel')).toBe(false)
  })

  it('dose vazia, zero, NaN ou conteúdo NULL ⇒ sem aviso de dose', () => {
    for (const dose of ['', 0, 'abc', null, undefined]) {
      expect(checkDosePlausibility({ dose: dose as any, doseUnit: 'mg', presentation: 'injetavel', penContent: 2.5, denominatorMl: 0.5 })).toEqual([])
    }
    expect(checkDosePlausibility({ dose: 99, doseUnit: 'mg', presentation: 'injetavel', penContent: null })).toEqual([])
  })

  it('dose igual ao conteúdo da caneta ⇒ coerente', () => {
    expect(checkDosePlausibility({ dose: 2.5, doseUnit: 'mg', presentation: 'injetavel', penContent: 2.5, denominatorMl: 0.5 })).toEqual([])
  })
})

describe('describeTreatment — FR-011 (PO-125-8)', () => {
  it('injetável /mL semanal', () => {
    const r = describeTreatment({
      medicineName: 'Mounjaro', presentation: 'injetavel', dosageUnit: 'mg/ml', dosagePerPill: 5,
      dose: 2.5, intakeUnit: 'mg', frequency: 'semanal', weekdays: ['terça'], timeSchedule: ['08:00'], today: TODAY,
    })
    expect(r.sentence).toBe('Mounjaro · injetável · 2,5 mg por aplicação · toda terça às 08:00')
    // Emenda AC4.1 (PO smoke 18/11): relativo para hoje/amanhã e sempre com horário.
    expect(r.next).toBe('Próxima: hoje às 08:00')
  })

  it('injetável em mg por caneta ⇒ 1 aplicação de X', () => {
    const r = describeTreatment({
      medicineName: 'Mounjaro', presentation: 'injetavel', dosageUnit: 'mg', dosagePerPill: 2.5,
      dose: 1, intakeUnit: null, frequency: 'semanal', weekdays: ['sábado'], timeSchedule: ['20:00'], today: TODAY,
    })
    expect(r.sentence).toBe('Mounjaro · injetável · 1 aplicação de 2,5 mg · todo sábado às 20:00')
    expect(r.next).toBe('Próxima: sábado, 21/11 às 20:00')
  })

  it('comprimido diário omite a forma', () => {
    const r = describeTreatment({
      medicineName: 'Losartana', presentation: 'comprimido', dosageUnit: 'mg', dosagePerPill: 50,
      dose: 1, frequency: 'diário', timeSchedule: ['20:00', '08:00'], today: TODAY,
    })
    expect(r.sentence).toBe('Losartana · 1 comprimido de 50 mg · todo dia às 08:00 e 20:00')
    expect(r.next).toBe('Próxima: hoje às 08:00')
  })

  it('hoje com horário por vir: o próximo horário de hoje (12/12h às 15:00 ⇒ 20:00)', () => {
    const r = describeTreatment({ medicineName: 'L', presentation: 'comprimido', dose: 1, frequency: 'diário', timeSchedule: ['08:00', '20:00'], today: TODAY, nowTime: '15:00' })
    expect(r.next).toBe('Próxima: hoje às 20:00')
  })

  it('horário de hoje já passou ⇒ "amanhã às" o 1º do dia', () => {
    const r = describeTreatment({ medicineName: 'L', presentation: 'comprimido', dose: 1, frequency: 'diário', timeSchedule: ['08:00'], today: TODAY, nowTime: '09:00' })
    expect(r.next).toBe('Próxima: amanhã às 08:00')
  })

  it('sem horário: só o dia', () => {
    const r = describeTreatment({ medicineName: 'L', presentation: 'comprimido', dose: 1, frequency: 'diário', timeSchedule: [], today: TODAY })
    expect(r.next).toBe('Próxima: hoje')
  })

  it('horário de hoje já passou ⇒ próxima é amanhã', () => {
    expect(nextDoseDate({ frequency: 'diário', timeSchedule: ['08:00'], today: TODAY, nowTime: '09:00' })).toBe('2026-11-18')
  })

  it('quando_necessário: sem horário e sem próxima', () => {
    const r = describeTreatment({ medicineName: 'Dipirona', presentation: 'liquido', dose: 20, intakeUnit: 'gotas', frequency: 'quando_necessário', timeSchedule: ['08:00'], today: TODAY })
    expect(r.sentence).toBe('Dipirona · líquido · 20 gotas por vez · quando precisar')
    expect(r.next).toBeNull()
  })

  it('mensal (intervalo 30) a partir do início', () => {
    const r = describeTreatment({ medicineName: 'X', presentation: 'injetavel', dose: 1, dosageUnit: 'mg', dosagePerPill: 10, frequency: 'intervalo_dias', intervalDays: 30, timeSchedule: ['08:00'], startDate: '2026-11-20', today: TODAY })
    expect(r.sentence).toBe('X · injetável · 1 aplicação de 10 mg · a cada 30 dias às 08:00')
    expect(r.next).toBe('Próxima: sexta, 20/11 às 08:00')
  })

  it('dias alternados conta a partir do início', () => {
    expect(nextDoseDate({ frequency: 'dias_alternados', startDate: '2026-11-16', today: TODAY })).toBe('2026-11-18')
  })

  it('semanal sem dia, dose vazia e forma NULL não quebram', () => {
    const r = describeTreatment({ medicineName: '', presentation: null, dose: '', frequency: 'semanal', weekdays: [], today: TODAY })
    expect(r.sentence).toBe('outro · toda semana')
    expect(r.next).toBeNull()
  })

  it('vários dias da semana em ordem', () => {
    const r = describeTreatment({ medicineName: 'A', presentation: 'comprimido', dose: 2, frequency: 'semanal', weekdays: ['sexta', 'segunda'], timeSchedule: ['08:00'], today: TODAY })
    expect(r.sentence).toBe('A · 2 comprimidos · toda segunda e sexta às 08:00')
    expect(r.next).toBe('Próxima: sexta, 20/11 às 08:00')
  })
})

describe('anchorFromApplication — AC2.5b', () => {
  // 2026-11-18 = quarta.
  it('semanal: aplicação ontem (terça) ⇒ toda terça, começa hoje', () => {
    expect(anchorFromApplication({ applicationDate: '2026-11-17', frequency: 'semanal', today: '2026-11-18' }))
      .toEqual({ start_date: '2026-11-18', weekdays: ['terça'] })
  })
  it('semanal: aplicação futura (sábado) ⇒ toda sábado, começa HOJE (em uso; smoke 18/11)', () => {
    expect(anchorFromApplication({ applicationDate: '2026-11-21', frequency: 'semanal', today: '2026-11-18' }))
      .toEqual({ start_date: '2026-11-18', weekdays: ['sábado'] })
  })
  it('a cada 30 dias: aplicação ontem ⇒ próxima em 30 dias, nunca no passado', () => {
    expect(anchorFromApplication({ applicationDate: '2026-11-17', frequency: 'intervalo_dias', intervalDays: 30, today: '2026-11-18' }))
      .toEqual({ start_date: '2026-12-17', weekdays: [] })
  })
  it('dias alternados: aplicação anteontem ⇒ hoje', () => {
    expect(anchorFromApplication({ applicationDate: '2026-11-16', frequency: 'dias_alternados', today: '2026-11-18' }).start_date)
      .toBe('2026-11-18')
  })
  it('a cada 30 dias: hoje ⇒ hoje', () => {
    expect(anchorFromApplication({ applicationDate: '2026-11-18', frequency: 'intervalo_dias', intervalDays: 30, today: '2026-11-18' }).start_date)
      .toBe('2026-11-18')
  })
})

describe('Mensal em toda forma (emenda FR-021, PO 2026-11-18)', () => {
  it.each(['comprimido', 'capsula', 'liquido', 'injetavel', 'pomada', 'spray', 'outro'])('%s oferece mensal_30', (p) => {
    expect(setupDefaults(p).frequencyOrder).toContain('mensal_30')
  })
})

// ── 1b: dose pela embalagem (simplificada no smoke 19/11 — só rótulo curado `lv`) ────────────

describe('derivePenDose — AC5.1 (PO-125-9)', () => {
  const mounjaro = { presentation: 'injetavel', dosageUnit: 'mg/ml', perMl: 5, volumeMl: 0.5 }

  it('Mounjaro 5 mg/mL × 0,5 mL (lv) ⇒ 2,5 mg', () => {
    expect(derivePenDose(mounjaro)).toEqual({ dose: 2.5, intakeUnit: 'mg' })
  })
  it('UI/mL ⇒ dose em UI', () => {
    expect(derivePenDose({ ...mounjaro, dosageUnit: 'ui/ml', perMl: 100, volumeMl: 0.4 })).toEqual({ dose: 40, intakeUnit: 'UI' })
  })
  it('degenerados ⇒ null (R-270)', () => {
    expect(derivePenDose({ ...mounjaro, volumeMl: null })).toBeNull()
    expect(derivePenDose({ ...mounjaro, volumeMl: 0 })).toBeNull()
    expect(derivePenDose({ ...mounjaro, volumeMl: -0.5 })).toBeNull()
    expect(derivePenDose({ ...mounjaro, volumeMl: '' })).toBeNull()
    expect(derivePenDose({ ...mounjaro, perMl: null })).toBeNull()
    expect(derivePenDose({ ...mounjaro, perMl: 0 })).toBeNull()
    expect(derivePenDose({ ...mounjaro, perMl: 'abc' })).toBeNull()
    expect(derivePenDose({ ...mounjaro, presentation: 'liquido' })).toBeNull()
    expect(derivePenDose({ ...mounjaro, dosageUnit: 'mg' })).toBeNull()
    expect(derivePenDose({ ...mounjaro, dosageUnit: null })).toBeNull()
  })
  it('volume de uma unidade acima de 1 mL não é dose única de injeção ⇒ null', () => {
    expect(derivePenDose({ ...mounjaro, volumeMl: 3 })).toBeNull()
  })
  it('teto do schema (1000) ⇒ null; vírgula aceita; sem dízima (R-277)', () => {
    expect(derivePenDose({ ...mounjaro, perMl: 5000, volumeMl: 0.5 })).toBeNull()
    expect(derivePenDose({ ...mounjaro, perMl: '5', volumeMl: '0,5' })).toEqual({ dose: 2.5, intakeUnit: 'mg' })
    expect(derivePenDose({ ...mounjaro, perMl: 4.17, volumeMl: 0.6 })?.dose).toBe(2.502)
  })
})

describe('dialDosesFromText — AC5.2 (doses do mostrador escritas na embalagem)', () => {
  it('Ozempic "(DOSES 0,25MG E 0,5 MG)" ⇒ [0.25, 0.5]; "(DOSES 1 MG)" ⇒ [1]', () => {
    expect(dialDosesFromText('1,34 MG/ML SOL INJ CT X 1 CAR VD TRANS X 1,5 ML + 1 SIST APLIC PLAS (DOSES 0,25MG E 0,5 MG) + 6 AGULHAS NOVOFINE')).toEqual([0.25, 0.5])
    expect(dialDosesFromText('1,34 MG/ML SOL INJ CT X 1 CAR VD TRANS X 3 ML + 1 SIST APLIC PLAS (DOSES 1 MG)')).toEqual([1])
  })
  it('sem "DOSES" ⇒ []; nulo ⇒ []; nunca lê a concentração', () => {
    expect(dialDosesFromText('5 MG/ML SOL INJ SC CT 4 SER PREENC VD TRANS X 0,5 ML')).toEqual([])
    expect(dialDosesFromText(null)).toEqual([])
    expect(dialDosesFromText('')).toEqual([])
  })
})

describe('checkDosePlausibility — rótulo reconstruído com ponto flutuante (smoke 1b C-1b-S6)', () => {
  // Lipoless salvo: 5 mg / 0,6 mL ⇒ o banco guarda 8,333333333333 mg/mL; × 0,6 = 4,9999999999998.
  const pen = 8.333333333333 * 0.6
  it('dose igual ao rótulo não avisa "maior que o rótulo"', () => {
    const w = checkDosePlausibility({ dose: 5, doseUnit: 'mg', presentation: 'injetavel', penContent: pen, denominatorMl: 0.6 })
    expect(w.map((x) => x.kind)).not.toContain('exceeds_pen')
  })
  it('dose acima do rótulo avisa com o número do rótulo arredondado (5, não 4,999…)', () => {
    const w = checkDosePlausibility({ dose: 7.5, doseUnit: 'mg', presentation: 'injetavel', penContent: pen, denominatorMl: 0.6 })
    expect(w.find((x) => x.kind === 'exceeds_pen')?.message).toBe('O rótulo diz 5 mg. Confirma 7,5 mg?')
  })
})

describe('checkDosePlausibility — contagem alta por tomada (smoke 1c, PO 19/11)', () => {
  const kinds = (input: Parameters<typeof checkDosePlausibility>[0]) => checkDosePlausibility(input).map((w) => w.kind)
  it.each([
    ['comprimido', null, 11],
    ['capsula', null, 20],
    ['liquido', 'gotas', 1000],
    ['liquido', 'ml', 60],
    ['injetavel', null, 3],
  ])('%s em %s: %s avisa', (presentation, doseUnit, dose) => {
    expect(kinds({ dose, doseUnit, presentation })).toContain('count_looks_high')
  })
  it.each([
    ['comprimido', null, 10],
    ['liquido', 'gotas', 40],
    ['liquido', 'ml', 45],
    ['injetavel', null, 1],
    ['injetavel', 'UI', 80],
    ['outro', null, 50],
  ])('%s em %s: %s não avisa (uso comum / sem teto)', (presentation, doseUnit, dose) => {
    expect(kinds({ dose, doseUnit, presentation })).not.toContain('count_looks_high')
  })
  it('texto diz a contagem e o que conferir', () => {
    const [w] = checkDosePlausibility({ dose: 3, doseUnit: null, presentation: 'injetavel' })
    expect(w.message).toBe('São 3 aplicações por vez. A dose em mg já vem na caneta: cada aplicação costuma ser 1 caneta.')
  })
})
