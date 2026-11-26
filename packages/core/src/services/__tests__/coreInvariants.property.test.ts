import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import {
  deriveStockForecast,
  type StockForecastInput,
  type StockForecastProtocol,
} from '../../utils/stockForecast'
import {
  checkDosePlausibility,
  pickSetupCard,
  SETUP_WINDOW_DAYS,
  type CoherenceVerdict,
  type DosePlausibilityInput,
  type FormMismatch,
  type PickSetupCardInput,
  type SetupPresentation,
} from '../treatmentSetup'
import { FREQUENCIES, INTAKE_UNITS, WEEKDAYS } from '../../schemas/protocolSchema'
import { DOSAGE_UNITS } from '../../schemas/medicineSchema'
import { addDays, formatLocalDate, parseLocalDate } from '../../utils/dateUtils'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

const TODAY = '2026-11-25'
const MED_ID = 'med-1'
const NUM_RUNS = 300

const PRESENTATIONS: readonly SetupPresentation[] = [
  'comprimido',
  'capsula',
  'liquido',
  'injetavel',
  'pomada',
  'spray',
  'outro',
]

const DOSE_UNITS = ['mg', 'UI', 'gotas', 'ml', '', null] as const

const INCOHERENT_VERDICT_ARB: fc.Arbitrary<Extract<CoherenceVerdict, { status: 'incoerente' }>> = fc.record({
  status: fc.constant('incoerente' as const),
  reason: fc.constantFrom('dose' as const, 'unidade' as const, 'conc_fora' as const),
  box: fc.constant(null),
  doseMass: fc.option(fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }), { nil: null }),
  probableSide: fc.constantFrom('caixa' as const, 'dose' as const),
  fixAvailable: fc.boolean(),
  multidose: fc.boolean(),
})

const FORM_MISMATCH_ARB: fc.Arbitrary<FormMismatch> = fc.record({
  proposed: fc.option(fc.constantFrom(...PRESENTATIONS), { nil: null }),
  reason: fc.constantFrom('catalog' as const, 'name' as const),
})

// ── Propriedade 1: deriveStockForecast ────────────────────────────────────────────────────────

const stockMedicineArb: fc.Arbitrary<StockForecastInput['medicine']> = fc.option(
  fc.record({
    dosage_unit: fc.constantFrom(...DOSAGE_UNITS),
    dosage_per_pill: fc.option(fc.double({ min: 0.1, max: 1000, noNaN: true, noDefaultInfinity: true }), { nil: null }),
    units_per_ml: fc.option(fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }), { nil: null }),
  }),
  { nil: null },
)

const stockQuantityArb: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant(Number.NaN),
  fc.constant(null),
  fc.constant(0),
  fc.constant(0.1 + 0.2),
  fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  fc.integer({ min: 0, max: 100_000 }),
)

const nonNegativeQuantityArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.constant(0.1 + 0.2),
  fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  fc.integer({ min: 0, max: 100_000 }),
)

const stockProtocolArb: fc.Arbitrary<StockForecastProtocol> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  medicine_id: fc.constantFrom(MED_ID, 'med-other'),
  frequency: fc.constantFrom(...FREQUENCIES),
  interval_days: fc.option(fc.integer({ min: 2, max: 180 }), { nil: null }),
  weekdays: fc.subarray([...WEEKDAYS]),
  time_schedule: fc.array(fc.constantFrom('08:00', '12:00', '20:00'), { minLength: 1, maxLength: 3 }),
  dosage_per_intake: fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
  intake_unit: fc.option(fc.constantFrom(...INTAKE_UNITS), { nil: null }),
  active: fc.constantFrom(true, false, null),
  start_date: fc.constantFrom('2026-11-01', '2026-11-25', '2026-12-01', null),
  end_date: fc.constantFrom('2026-11-20', '2026-11-25', '2026-12-31', null),
})

const inactiveOrOtherProtocolArb: fc.Arbitrary<StockForecastProtocol> = fc.oneof(
  stockProtocolArb.map((p) => ({ ...p, medicine_id: 'med-other' })),
  stockProtocolArb.map((p) => ({ ...p, active: false })),
  stockProtocolArb.map((p) => ({ ...p, end_date: '2026-11-20' })),
  stockProtocolArb.map((p) => ({ ...p, start_date: '2026-12-01' })),
)

describe('Propriedade 1 — deriveStockForecast invariantes', () => {
  it('nunca lança e garante dailyIntake >= 0, !NaN(dailyIntake) e !NaN(runwayDays)', () => {
    fc.assert(
      fc.property(
        stockQuantityArb,
        stockMedicineArb,
        fc.array(stockProtocolArb, { maxLength: 5 }),
        (quantity, medicine, protocols) => {
          const forecast = deriveStockForecast({
            medicineId: MED_ID,
            medicine,
            protocols,
            quantity,
            asOf: TODAY,
          })

          expect(forecast.dailyIntake).toBeGreaterThanOrEqual(0)
          expect(Number.isNaN(forecast.dailyIntake)).toBe(false)
          expect(Number.isNaN(forecast.runwayDays)).toBe(false)

          if (forecast.dailyIntake === 0) {
            expect(forecast.regime).toBe('no_forecast')
            expect(forecast.daysRemaining).toBeNull()
            expect(forecast.alertExpected).toBe(false)
          }
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  it('monotonicidade de saldo: q2 >= q1 >= 0 preserva daysRemaining(q2) >= daysRemaining(q1)', () => {
    fc.assert(
      fc.property(
        nonNegativeQuantityArb,
        nonNegativeQuantityArb,
        stockMedicineArb,
        fc.array(stockProtocolArb, { maxLength: 5 }),
        (a, b, medicine, protocols) => {
          const q1 = Math.min(a, b)
          const q2 = Math.max(a, b)

          const f1 = deriveStockForecast({
            medicineId: MED_ID,
            medicine,
            protocols,
            quantity: q1,
            asOf: TODAY,
          })
          const f2 = deriveStockForecast({
            medicineId: MED_ID,
            medicine,
            protocols,
            quantity: q2,
            asOf: TODAY,
          })

          if (f1.daysRemaining !== null && f2.daysRemaining !== null) {
            expect(f2.daysRemaining).toBeGreaterThanOrEqual(f1.daysRemaining)
          } else {
            expect(f1.daysRemaining).toBeNull()
            expect(f2.daysRemaining).toBeNull()
          }
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  it('quando dailyIntake === 0 ⇒ regime no_forecast, daysRemaining null e alertExpected false', () => {
    fc.assert(
      fc.property(
        stockQuantityArb,
        stockMedicineArb,
        fc.array(inactiveOrOtherProtocolArb, { maxLength: 5 }),
        (quantity, medicine, protocols) => {
          const forecast = deriveStockForecast({
            medicineId: MED_ID,
            medicine,
            protocols,
            quantity,
            asOf: TODAY,
          })

          expect(forecast.dailyIntake).toBe(0)
          expect(forecast.regime).toBe('no_forecast')
          expect(forecast.daysRemaining).toBeNull()
          expect(forecast.alertExpected).toBe(false)
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })
})

// ── Propriedade 2: checkDosePlausibility ──────────────────────────────────────────────────────

const plausibilityNumberOrStringArb: fc.Arbitrary<number | string | null> = fc.oneof(
  fc.constant('2,5'),
  fc.constant('0,6'),
  fc.constant(''),
  fc.constant(0),
  fc.constant(null),
  fc.constant('abc'),
  fc.integer({ min: 0, max: 1_000_000 }),
  fc.double({ min: 0.001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  fc.tuple(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 99 })).map(
    ([whole, dec]) => `${whole},${dec}`,
  ),
)

const plausibilityInputArb: fc.Arbitrary<DosePlausibilityInput> = fc.record({
  presentation: fc.constantFrom(...PRESENTATIONS),
  doseUnit: fc.constantFrom(...DOSE_UNITS),
  dose: plausibilityNumberOrStringArb,
  penContent: plausibilityNumberOrStringArb,
  denominatorMl: plausibilityNumberOrStringArb,
  concentrationMgPerMl: plausibilityNumberOrStringArb,
})

describe('Propriedade 2 — checkDosePlausibility invariantes', () => {
  it('nunca lança e toda mensagem é não-vazia sem NaN, Infinity ou undefined', () => {
    fc.assert(
      fc.property(plausibilityInputArb, (input) => {
        const warnings = checkDosePlausibility(input)

        expect(Array.isArray(warnings)).toBe(true)
        for (const w of warnings) {
          expect(typeof w.message).toBe('string')
          expect(w.message.trim().length).toBeGreaterThan(0)
          expect(w.message).not.toContain('NaN')
          expect(w.message).not.toContain('Infinity')
          expect(w.message).not.toContain('undefined')
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// ── Propriedade 3: pickSetupCard ──────────────────────────────────────────────────────────────

function localCreatedAt(daysAgo: number): string {
  const localDay = formatLocalDate(addDays(parseLocalDate(TODAY), -daysAgo))
  return `${localDay}T12:00:00`
}

describe('Propriedade 3 — pickSetupCard precedência e janela', () => {
  it('precedência estrita: qualquer protocolo incoerente vence forma, vincular e falta', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.nat({ max: 5 }),
        INCOHERENT_VERDICT_ARB,
        fc.array(FORM_MISMATCH_ARB, { minLength: 1, maxLength: 6 }),
        fc.array(fc.integer({ min: 0, max: 30 }), { maxLength: 5 }),
        fc.array(fc.integer({ min: 0, max: 30 }), { maxLength: 5 }),
        (protocolCount, rawIncoherentIdx, incoherentVerdict, mismatches, linkIndices, orphanDays) => {
          const incoherentIdx = rawIncoherentIdx % protocolCount
          const protocols: PickSetupCardInput['protocols'] = Array.from({ length: protocolCount }, (_, idx) => ({
            id: `p-${idx}`,
            medicine_id: `m-${idx}`,
            created_at: localCreatedAt(0),
          }))

          const verdicts: Record<string, CoherenceVerdict | undefined> = {}
          const formMismatches: Record<string, FormMismatch | null | undefined> = {}
          const linkCandidateIds: string[] = []

          for (let idx = 0; idx < protocolCount; idx++) {
            const p = protocols[idx]
            if (idx === incoherentIdx) {
              verdicts[p.id] = incoherentVerdict
            } else {
              verdicts[p.id] = idx % 2 === 0 ? { status: 'coerente' } : { status: 'indeterminado' }
            }
            if (p.medicine_id) {
              formMismatches[p.medicine_id] = mismatches[idx % mismatches.length]
              if (linkIndices.includes(idx)) {
                linkCandidateIds.push(p.medicine_id)
              }
            }
          }

          const orphanMedicines = orphanDays.map((daysAgo, idx) => ({
            id: `orphan-${idx}`,
            created_at: localCreatedAt(daysAgo),
          }))

          const pick = pickSetupCard({
            protocols,
            formMismatches,
            linkCandidateIds,
            loggedProtocolIds: [],
            verdicts,
            orphanMedicines,
            today: TODAY,
          })

          expect(pick).not.toBeNull()
          expect(pick?.kind).toBe('confira')
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  it('orphanMedicines criados há > SETUP_WINDOW_DAYS (15..365 dias) nunca retornam falta', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: SETUP_WINDOW_DAYS + 1, max: 365 }), { minLength: 1, maxLength: 8 }),
        (daysAgoList) => {
          const orphanMedicines = daysAgoList.map((daysAgo, idx) => ({
            id: `orphan-${idx}`,
            created_at: localCreatedAt(daysAgo),
          }))

          const pick = pickSetupCard({
            protocols: [],
            formMismatches: {},
            linkCandidateIds: [],
            loggedProtocolIds: [],
            verdicts: {},
            orphanMedicines,
            today: TODAY,
          })

          expect(pick?.kind).not.toBe('falta')
          expect(pick).toBeNull()
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })
})
