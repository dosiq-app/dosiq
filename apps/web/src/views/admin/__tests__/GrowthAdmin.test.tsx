import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Spec 118 — PO-118-3 (referência da base ao lado de cada %) e PO-118-4 (aviso só com n < 30,
 * n absoluto sempre visível). O hook é real; só o service é mockado.
 */
vi.mock('@services/api/growthAdminService', () => ({ growthAdminService: { load: vi.fn() } }))

import GrowthAdmin from '../GrowthAdmin'
import { growthAdminService } from '@services/api/growthAdminService'

const svc = growthAdminService as any

const FEATURES = ['titration', 'biomarker', 'critical_alarm', 'stock', 'end_date']

function analytics({ users, withProtocols, glp1Pct, featurePct }: { users: number; withProtocols: number; glp1Pct: number; featurePct: number }) {
  const rate = (pct: number) => ({ users: Math.round((pct * withProtocols) / 100), protocols: 1, users_pct: pct })
  return {
    generated_at: '2026-11-10T12:00:00Z',
    excluded_count: 0,
    total_users: users,
    totals: {
      users, new_7d: 1, new_30d: 2, users_with_protocols: withProtocols, protocols: withProtocols,
      push_active_users: 1, push_active_pct: glp1Pct, stock_users_pct: 0, critical_alarm_users_pct: 0,
    },
    class_distribution: withProtocols ? [{ class_code: 'A10S', label: 'Antidiabeticos', wedge: 'glp1_antiobesidade', users: 1, protocols: 1, users_pct: glp1Pct }] : [],
    wedge: {
      glp1_antiobesidade: rate(glp1Pct),
      antidiabeticos_outros: rate(0),
      outras: rate(0),
      sem_codigo: rate(0),
    },
    frequency_distribution: [],
    feature_rates: FEATURES.map((feature) => ({ feature, ...rate(featurePct), protocols_pct: featurePct })),
    denominators: { users_all: withProtocols, protocols_all: withProtocols },
    users: [],
  }
}

const BASE = analytics({ users: 95, withProtocols: 60, glp1Pct: 33.3, featurePct: 20 })
const cohortOf = (withProtocols: number) => ({
  base: BASE,
  cohort: { key: 'v034', since: '2026-10-22T00:00:00-03:00', data: analytics({ users: 37, withProtocols, glp1Pct: 50, featurePct: 40 }) },
})

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

async function renderInCohort(withProtocols: number) {
  svc.load.mockResolvedValueOnce({ base: BASE, cohort: null }).mockResolvedValueOnce(cohortOf(withProtocols))
  render(<GrowthAdmin />)
  await screen.findByRole('button', { name: 'Pós-v0.34' })
  fireEvent.click(screen.getByRole('button', { name: 'Pós-v0.34' }))
  await screen.findByText(/cadastros desde 22\/10\/2026/)
}

describe('GrowthAdmin — recorte pós-v0.34 (spec 118)', () => {
  it('modo total: sem referência da base, sem aviso, chip "Base total" pressionado', async () => {
    svc.load.mockResolvedValueOnce({ base: BASE, cohort: null })
    render(<GrowthAdmin />)
    await screen.findByText('Wedge por classe terapêutica')
    expect(screen.getByRole('button', { name: 'Base total' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/base \d/)).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByText(/coorte 30d/)).toBeNull()
  })

  it('PO-118-3: cada % do recorte traz "· base X%" (KPI, wedge, classes, features)', async () => {
    await renderInCohort(40)
    expect(screen.getByRole('button', { name: 'Pós-v0.34' })).toHaveAttribute('aria-pressed', 'true')
    expect(svc.load).toHaveBeenLastCalledWith({ cohort: 'v034' })
    // wedge GLP-1: KPI + barra + classe A10S
    expect(screen.getAllByText(/base 33,3%/).length).toBeGreaterThanOrEqual(3)
    // 5 features + 3 buckets do wedge sem uso (base 0%)
    expect(screen.getAllByText(/base 20%/)).toHaveLength(5)
    const features = screen.getByText('Adoção de features clínicas').closest('section') as HTMLElement
    expect(within(features).getAllByText(/\(16 de 40\)/)).toHaveLength(5)
  })

  it('PO-118-4: n < 30 acende o aviso com o n absoluto; n ≥ 30 não', async () => {
    await renderInCohort(12)
    const notes = screen.getAllByRole('note')
    expect(notes).toHaveLength(2)
    expect(notes[0].textContent).toContain('12 usuários')
  })

  it('PO-118-4: n = 30 não avisa', async () => {
    await renderInCohort(30)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('coorte sem tratamento: estado vazio, não "0% (0 de 0)", e sem aviso', async () => {
    await renderInCohort(0)
    expect(screen.getAllByText('Nenhum usuário com tratamento ativo neste recorte.')).toHaveLength(2)
    // a lista de contas vazia ("0 de 0") é da tabela; os painéis não renderizam barra sem denominador
    for (const title of ['Wedge por classe terapêutica', 'Adoção de features clínicas']) {
      const panel = screen.getByText(title).closest('section') as HTMLElement
      expect(within(panel).queryByText(/0 de 0/)).toBeNull()
    }
    expect(screen.queryByRole('note')).toBeNull()
    await waitFor(() => expect(svc.load).toHaveBeenCalledTimes(2))
  })
})

it('RC5: durante a troca de modo o conteúdo antigo fica marcado como ocupado', async () => {
  let resolveCohort: (v: unknown) => void = () => {}
  svc.load.mockResolvedValueOnce({ base: BASE, cohort: null }).mockImplementationOnce(() => new Promise((res) => { resolveCohort = res }))
  const { container } = render(<GrowthAdmin />)
  await screen.findByText('Wedge por classe terapêutica')
  fireEvent.click(screen.getByRole('button', { name: 'Pós-v0.34' }))
  await waitFor(() => expect(container.querySelector('.growth-admin__content')).toHaveAttribute('aria-busy', 'true'))
  resolveCohort(cohortOf(40))
  await screen.findByText(/cadastros desde/)
  expect(container.querySelector('.growth-admin__content')).toHaveAttribute('aria-busy', 'false')
})
