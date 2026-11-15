// Textos do aviso de lembretes desligados (spec 120 D-3/D-5). Sem possessivo, sem "protocolo" (INV-3).
import { ANDROID_PUSH_CHANNEL } from '@dosiq/core'
import { Platform } from 'react-native'
import type { ReachReason } from '@platform/notifications/usePushReachability'
import type { NextDoseReminder } from '@dashboard/utils/nextDoseReminder'

export const PUSH_PERMISSION_SETTINGS_HINT = 'Dá para ligar depois em Perfil › Notificações.'

// "a dose de X de amanhã às 08:00" | "a próxima dose (X) de …" | null (sem horário conhecido).
function _doseFact(reminder: NextDoseReminder | null, multiple: boolean): string | null {
  if (!reminder) return null
  const at = `${reminder.when} às ${reminder.time}`
  return multiple ? `a próxima dose (${reminder.medicineName}) de ${at}` : `a dose de ${reminder.medicineName} de ${at}`
}

const _cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function _doseSubtitle(reminder: NextDoseReminder | null, multiple: boolean): string {
  const fact = _doseFact(reminder, multiple)
  return fact ? `Sem eles, ${fact} não vai avisar.` : 'Sem eles, nenhum lembrete de dose vai chegar.'
}

// Smoke 120 (iOS): o rótulo do toggle no iOS é "Permitir Notificações" (assim, com N maiúsculo).
// O Android não tem um nome único entre fabricantes ⇒ instrução sem citar o rótulo.
// Smoke 120 (PO): o passo a passo mora no PREPARO (modo Ajustes), não no card — card curto.
// U-1 (120 C): no canal o toque já cai na tela dele — basta ativar.
export function pushSettingsHint(reason: ReachReason, blockedChannel: string | null = null): string {
  if (reason === 'channel_blocked') {
    return blockedChannel === ANDROID_PUSH_CHANNEL.CRITICAL
      ? 'As notificações de doses críticas estão desligadas nos Ajustes. Vamos abrir direto nelas: é só ativar.'
      : 'Os lembretes de dose estão desligados nos Ajustes. Vamos abrir direto neles: é só ativar.'
  }
  return Platform.OS === 'ios'
    ? 'As notificações estão desligadas nos Ajustes. Vamos abrir lá: toque em Notificações e ative Permitir Notificações.'
    : 'As notificações estão desligadas nos Ajustes. Vamos abrir lá: toque em Notificações e ative.'
}

// Smoke 120 (PO 14/11): bloqueado também cita a dose — é o argumento para religar.
function _blockedSubtitle(reminder: NextDoseReminder | null, multiple: boolean, stillBlocked: boolean): string {
  const fact = _doseFact(reminder, multiple)
  if (stillBlocked) return fact ? `Continuam desligadas: ${fact} não vai avisar.` : 'Continuam desligadas: nenhum lembrete de dose vai chegar.'
  return fact ? `${_cap(fact)} não vai avisar. Libere em Ajustes › Notificações.` : 'Libere em Ajustes › Notificações para receber os lembretes.'
}

export function pushPermissionCopy({ reason, reminder, multiple, stillBlocked, critical = false }: { reason: ReachReason; reminder: NextDoseReminder | null; multiple: boolean; stillBlocked: boolean; critical?: boolean }) {
  if (reason === 'undetermined') {
    return { title: 'Os lembretes estão desligados', subtitle: _doseSubtitle(reminder, multiple), cta: 'Ligar lembretes' }
  }
  // S-15: canal crítico bloqueado ⇒ o título diz qual lembrete falta.
  const channelTitle = critical ? 'Os lembretes de dose crítica estão desligados nos Ajustes' : 'Os lembretes de dose estão desligados nos Ajustes'
  const title = reason === 'channel_blocked' ? channelTitle : 'As notificações estão bloqueadas'
  return { title, subtitle: _blockedSubtitle(reminder, multiple, stillBlocked), cta: 'Abrir Ajustes' }
}
