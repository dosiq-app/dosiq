// spec 120 C · US9 cenário 1 · PO-120-16/17 · RC2-C DC-6 — card "doses de hoje sem registro".
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import UnloggedDosesCard from '../UnloggedDosesCard'
import { groupUnloggedDoses, toSkipPayload, toInstancedItems, skipToastMessage } from '../../utils/unloggedDoses'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const d = (id: string, time: string, iso: string, name: string, status = 'SEM_REGISTRO') => ({
  instanceId: id, scheduledTime: time, scheduledFor: iso, timelineStatus: status, medicineName: name,
  medicine: { name: 'vivo' }, protocol: { id: `p-${id}` },
})
const TL = [
  d('a', '08:00', '2026-11-14T11:00:00Z', 'Glifage'),
  d('b', '08:00', '2026-11-14T11:00:00Z', 'Cozaar'),
  d('c', '12:00', '2026-11-14T15:00:00Z', 'Lipitor'),
  d('d', '14:00', '2026-11-14T17:00:00Z', 'Vit D'),
  d('e', '17:40', '2026-11-14T20:40:00Z', 'Glifage', 'TOMADA'),
  d('f', '22:00', '2026-11-15T01:00:00Z', 'X', 'PLANEJADA'),
]

describe('groupUnloggedDoses', () => {
  it('só SEM_REGISTRO, por horário, mais antigo primeiro, nome da ocorrência (R-299)', () => {
    const g = groupUnloggedDoses(TL)
    expect(g.map((x) => [x.scheduledTime, x.names])).toEqual([['08:00', ['Glifage', 'Cozaar']], ['12:00', ['Lipitor']], ['14:00', ['Vit D']]])
  })
  it('entrada vazia/degenerada ⇒ []', () => {
    expect(groupUnloggedDoses(null)).toEqual([])
    expect(groupUnloggedDoses([null, { timelineStatus: 'SEM_REGISTRO' }] as any)).toEqual([])
  })
  it('pulo do grupo: uma chamada com todas as instâncias do horário (E-9)', () => {
    const [g] = groupUnloggedDoses(TL)
    expect(toSkipPayload(g)).toEqual({
      doseInstanceId: 'a', protocolId: 'p-a', scheduledFor: '2026-11-14T11:00:00Z', isGrouped: 'true',
      groupedDoses: JSON.stringify([{ instanceId: 'a', protocolId: 'p-a' }, { instanceId: 'b', protocolId: 'p-b' }]),
    })
    expect(skipToastMessage(g)).toBe('Doses das 08:00 marcadas como puladas')
  })
  it('registro do grupo leva o instanceId de cada dose (PO-120-16)', () => {
    const [g] = groupUnloggedDoses(TL)
    expect(toInstancedItems(g.doses).map((i) => i.instanceId)).toEqual(['a', 'b'])
  })
})

// Smoke 14/11 (C-02): o card virou RESUMO — ações só na agenda.
describe('UnloggedDosesCard (resumo)', () => {
  it('total + horários; um só CTA que leva à agenda; sem Registrar/Pular', () => {
    const onSeeAgenda = jest.fn()
    const { getByText, queryByText } = render(<UnloggedDosesCard groups={groupUnloggedDoses(TL)} onSeeAgenda={onSeeAgenda} />)
    expect(getByText('4 doses de hoje sem registro')).toBeTruthy()
    expect(getByText('08:00, 12:00, 14:00')).toBeTruthy()
    expect(queryByText('Registrar')).toBeNull()
    expect(queryByText('Pular')).toBeNull()
    fireEvent.press(getByText('Ver na agenda'))
    expect(onSeeAgenda).toHaveBeenCalled()
  })
  it('singular', () => {
    const { getByText } = render(<UnloggedDosesCard groups={groupUnloggedDoses([TL[2]])} onSeeAgenda={jest.fn()} />)
    expect(getByText('1 dose de hoje sem registro')).toBeTruthy()
  })
  it('sem grupos ⇒ nada', () => {
    expect(render(<UnloggedDosesCard groups={[]} onSeeAgenda={jest.fn()} />).toJSON()).toBeNull()
  })
  it('nunca diz "perdida"/"esqueceu" nem possessivo (DC-3/DC-10)', () => {
    const { queryByText } = render(<UnloggedDosesCard groups={groupUnloggedDoses(TL)} onSeeAgenda={jest.fn()} />)
    expect(queryByText(/perdid|esquec|sua|seu/i)).toBeNull()
  })
})
