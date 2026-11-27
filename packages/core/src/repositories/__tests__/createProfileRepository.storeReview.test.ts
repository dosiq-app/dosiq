// Clique no botão de avaliar na loja (user_settings.store_review_clicked_at) e sua presença no
// export LGPD (allowlist explícita).

import { describe, it, expect, afterEach, vi } from 'vitest'
import { createProfileRepository } from '../createProfileRepository'

function makeClient(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    upsert: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  const client = {
    _builder: builder,
    from: vi.fn(() => builder),
    rpc: vi.fn(),
  }
  return client
}

const FAKE_USER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const getUserId = async () => FAKE_USER

describe('createProfileRepository — clique na loja (047)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('recordStoreReviewClicked faz upsert por user_id com o instante e updated_at', async () => {
    const client = makeClient({ data: null, error: null })
    const repo = createProfileRepository({ client: client as never, getUserId })

    await repo.recordStoreReviewClicked()

    expect(client.from).toHaveBeenCalledWith('user_settings')
    const [row, opts] = client._builder.upsert.mock.calls[0] as unknown as [Record<string, unknown>, unknown]
    expect(opts).toEqual({ onConflict: 'user_id' })
    expect(row.user_id).toBe(FAKE_USER)
    expect(typeof row.store_review_clicked_at).toBe('string')
    expect(Number.isNaN(Date.parse(row.store_review_clicked_at as string))).toBe(false)
    expect(row.updated_at).toBe(row.store_review_clicked_at)
    expect(Object.keys(row).sort()).toEqual(['store_review_clicked_at', 'updated_at', 'user_id'])
  })

  it('recordStoreReviewClicked propaga erro do Supabase (caller decide o que fazer)', async () => {
    const client = makeClient({ data: null, error: new Error('42501') })
    await expect(
      createProfileRepository({ client: client as never, getUserId }).recordStoreReviewClicked(),
    ).rejects.toThrow('42501')
  })

  it('export LGPD inclui store_review_clicked_at', async () => {
    const client = makeClient({ data: { store_review_clicked_at: null }, error: null })
    await createProfileRepository({ client: client as never, getUserId }).getProfileForExport()

    const selected = (client._builder.select.mock.calls[0] as unknown as [string])[0]
    expect(selected.split(',').map((c) => c.trim())).toContain('store_review_clicked_at')
    expect(selected).not.toContain('verification_token')
  })
})
