// dashboardService.js — serviço thin para dados do dashboard mobile
// ADR-029: thin local service — chama Supabase directamente via nativeSupabaseClient
// Schemas de domínio via @dosiq/core (nunca duplicar lógica de negócio)

import { z } from 'zod'
import { supabase } from '@platform/supabase/nativeSupabaseClient'
import { parseLocalDate, getTodayLocal, addDays, createDoseInstanceRepository, classifyWedge } from '@dosiq/core'
import { debugLog } from '@shared/utils/debugLog'

// Repo de instâncias (leitura de adesão ← dose_instances, S3.6). RLS escopa por user_id.
// TODO(040-strict): supabase client local não tipado como Database (nível B)
const doseInstanceRepo = createDoseInstanceRepository({ client: supabase as any })

/**
 * Busca protocolos ativos do utilizador.
 * Seleciona apenas colunas necessárias para o dashboard (R-127: slim select).
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getActiveProtocols(userId, dateStr) {
  z.string().uuid().parse(userId)
  const { data, error } = await supabase
    .from('protocols')
    // 029 F3 (T014): `titration_steps(...)` é a escada N2 DESTE protocolo — a FK
    // titration_steps.protocol_id → protocols.id faz o filtro por protocolo sair de graça.
    // O `useAlarmScheduler` repassa estes protocolos ao `ensureInstancesUpTo` → gerador; sem o
    // embed, a dose de titulação degradaria para `dosage_per_intake` em silêncio sob
    // TITRATION_SOURCE=n2 (a escada inteira, por outro lado, vazaria a dose de outro
    // medicamento no caso cross-med — por isso o recorte é por protocolo).
    // 029 F6: `titration_status` saiu deste select — a coluna N1 foi DROPADA. Ela já não
    // tinha consumidor aqui (nenhum campo do dashboard derivava dela); ficou só porque
    // `select()` é string e nada no pipeline confronta a string com o schema: nem tsc (não
    // é tipada), nem os testes (o client é mockado). Mantê-la = `42703` pós-DROP, que é
    // exatamente como web+mobile+cron caíram no #750 (AP-300 / R-295).
    // 100 B (RC3 E-1): `tracked_measure` alimenta o pedido pós-dose (single, hero, deeplink). Sem ela
    // `effectiveMeasure` devolve `missing` e o pedido falha fechado. R-295: 200 em QA e prod 2026-10-30.
    // 125 fatia 2 (AC6.1): `created_at` define o "1º uso" do card de setup. R-295: timestamptz com SELECT de
    // `authenticated` em prod e QA (MCP information_schema 2026-11-19).
    .select('id, name, medicine_id, active, frequency, interval_days, time_schedule, dosage_per_intake, intake_unit, start_date, end_date, weekdays, critical_alarm, tracked_measure, treatment_plan_id, created_at, treatment_plan:treatment_plans(id, name, emoji, color), titration_steps(id, position, dose, duration_days, status, started_at, medicine_id)')
    .eq('user_id', userId)
    .eq('active', true)
    .lte('start_date', dateStr)
    .or(`end_date.is.null,end_date.gte.${dateStr}`)
    .order('name')

  if (error) throw error
  return data ?? []
}

/**
 * Busca os logs de medicação de um dia específico.
 * Boundaries em UTC derivadas da meia-noite local (parseLocalDate).
 * Padrão do projecto: todos os timestamps no DB são UTC (R-020).
 * parseLocalDate('2026-04-13') → new Date('2026-04-13T00:00:00') → meia-noite local
 * .toISOString() → '2026-04-13T03:00:00.000Z' (para UTC-3) — boundary correcta.
 *
 * @param {string} userId
 * @param {string} dateStr  — formato YYYY-MM-DD
 * @returns {Promise<Array>}
 */
/**
 * 086 (RC2 D-13): tratamentos AGENDADOS — ativos que ainda não começaram (`start_date` > hoje).
 * Só para a aba Hoje distinguir "nenhuma dose hoje" de "primeiro uso" e dizer a próxima dose.
 * Separada de `getActiveProtocols` de propósito: aquela alimenta alarmes e Live Activity, que NÃO
 * devem ver tratamento que não começou. Colunas = subconjunto do select de `getActiveProtocols`;
 * gate R-295 executado em 2026-09-30 (REST 200).
 * @param {string} userId
 * @param {string} dateStr - YYYY-MM-DD (hoje local)
 * @returns {Promise<Array>}
 */
export async function getScheduledProtocols(userId, dateStr) {
  z.string().uuid().parse(userId)
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dateStr) // R-121 (RC6 #845)
  const { data, error } = await supabase
    .from('protocols')
    // 125 fatia 2 (C-2-1): tratamento com início futuro também recebe card de setup — dose e `created_at`
    // entram. R-295: colunas com SELECT de `authenticated` em prod e QA (MCP 2026-11-19).
    .select('id, name, medicine_id, active, frequency, interval_days, time_schedule, dosage_per_intake, intake_unit, start_date, end_date, weekdays, created_at')
    .eq('user_id', userId)
    .eq('active', true)
    .gt('start_date', dateStr)
    .order('start_date')

  if (error) throw error
  return data ?? []
}

export async function getTodayLogs(userId, dateStr) {
  z.string().uuid().parse(userId)
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dateStr)
  // Boundaries UTC derivadas da meia-noite local (R-020: nunca raw new Date('YYYY-MM-DDT...'))
  // startUTC = meia-noite local do dia → UTC
  const startLocal = parseLocalDate(dateStr)
  const startUTC = startLocal.toISOString()
  // endUTC = meia-noite local do dia seguinte → UTC (exclusive upper boundary)
  const endLocal = addDays(startLocal, 1)
  const endUTC = endLocal.toISOString()
  debugLog('dashboardService', `getTodayLogs boundaries — start: ${startUTC} end: ${endUTC}`)

  const { data, error } = await supabase
    .from('medicine_logs')
    .select('id, protocol_id, medicine_id, taken_at, quantity_taken')
    .eq('user_id', userId)
    .gte('taken_at', startUTC)
    .lt('taken_at', endUTC)

  if (error) throw error
  return data ?? []
}

/**
 * Busca os dados dos medicamentos referenciados pelos protocolos.
 * Usado para enriquecer a lista de doses na tela Hoje.
 *
 * @param {string[]} medicineIds
 * @returns {Promise<Record<string, Object>>} — map de id → { name, dosage_per_pill, dosage_unit }
 */
export async function getMedicinesData(medicineIds) {
  // Validação conforme regra de camada de serviço (R-125)
  z.array(z.string().uuid()).parse(medicineIds)

  if (!medicineIds.length) return {}

  const { data, error } = await supabase
    .from('medicines')
    // 121 A (FR-001, RC3 E-3): `therapeutic_class_code` classifica o perfil wedge/misto da Hoje.
    // R-295: coluna `text` com SELECT de `authenticated` em prod e QA (MCP 2026-11-15).
    // 125 fatia 2 (FR-019): `anvisa_registration` busca as forças do registro no sidecar 127. R-295: prod e QA 2026-11-19.
    // 125 fatia 2a (FR-037): `active_ingredient` casa o remédio sem código com a lista (Vincular). R-295: prod e QA 2026-11-22.
    .select('id, name, type, presentation, dosage_per_pill, dosage_unit, concentration_volume_ml, units_per_ml, therapeutic_class_code, anvisa_registration, active_ingredient')
    .in('id', medicineIds)

  if (error) throw error

  return (data ?? []).reduce((acc, m) => {
    acc[m.id] = {
      name: m.name,
      // type + presentation: ícone canônico de identificação (getMedicineIconName, 012 Fase A)
      type: m.type,
      presentation: m.presentation,
      active_ingredient: m.active_ingredient,
      dosage_per_pill: m.dosage_per_pill,
      dosage_unit: m.dosage_unit,
      concentration_volume_ml: m.concentration_volume_ml,
      units_per_ml: m.units_per_ml,
      therapeutic_class_code: m.therapeutic_class_code ?? null,
      anvisa_registration: m.anvisa_registration ?? null
    }
    return acc
  }, {})
}

/**
 * Busca as configurações do usuário, incluindo o nome.
 * @param {string} userId
 * 090 D-1 (INV-1): "sem linha" devolve `null` (conta nova antes do consentimento — não é erro);
 * falha real LANÇA. A versão com `.single()` fazia o contrário: 0 linhas (PGRST116) abortava os
 * bridges de alarme e o erro real virava `null` em silêncio. Espelha `getUserTimezone`.
 * @returns {Promise<Object|null>}
 */
export async function getUserSettings(userId) {
  z.string().uuid().parse(userId)
  const { data, error } = await supabase
    .from('user_settings')
    .select('display_name, timezone, complexity_override')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Busca logs para um período de dias (histórico).
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array>}
 */
export async function getLogsForPeriod(userId, days = 7) {
  z.string().uuid().parse(userId)
  
  // boundaries UTC baseadas na meia-noite local
  const todayStr = getTodayLocal()
  const startLocal = addDays(todayStr, -(days - 1))
  const startUTC = startLocal.toISOString()
  
  const endLocal = addDays(todayStr, 1)
  const endUTC = endLocal.toISOString()
  
  const { data, error } = await supabase
    .from('medicine_logs')
    .select('id, protocol_id, medicine_id, taken_at, quantity_taken')
    .eq('user_id', userId)
    .gte('taken_at', startUTC)
    .lt('taken_at', endUTC)

  if (error) throw error
  return data ?? []
}

/**
 * Busca as ocorrências materializadas (`dose_instances`) do usuário numa janela de `days`
 * dias até hoje + AMANHÃ (S3.6, ADR-054). Fonte da adesão/streak no mobile —
 * `taken/(taken+missed)`, `skipped_*` neutro — em vez de inferir sobre logs ±2h.
 * F4.3e: a janela superior vai até o FIM de amanhã (não fim de hoje) p/ o `lookAhead`
 * ("Em breve") enxergar as doses do começo de amanhã dentro da tolerância — espelha o
 * fetch web `[ontem, amanhã]`. Janela curta (≤15d) é OOM-safe (R-249).
 *
 * @param {string} userId
 * @param {number} days - dias para trás (default 14: 7d atual + 7d anterior p/ o trend)
 * @param {number} lookAheadDays - dias para frente além de amanhã (default 2 = fim de amanhã)
 * @returns {Promise<Array>} linhas de dose_instances (status, scheduled_for, ...)
 */
export async function getDoseInstancesForPeriod(userId, days = 14, lookAheadDays = 2) {
  z.string().uuid().parse(userId)

  const todayStr = getTodayLocal()
  const startUTC = addDays(todayStr, -(days - 1)).toISOString()
  const endUTC = addDays(todayStr, lookAheadDays).toISOString()

  return doseInstanceRepo.getWindow(userId, startUTC, endUTC)
}

/**
 * Busca SÓ a data das doses registradas nos últimos `days` dias (select enxuto — R-127).
 * Fonte do gatilho do card de upsell de estoque (spec 044, F4b / T018): `useTodayData`
 * só carrega 14 dias de logs, insuficiente para o critério de streak de 14 dias
 * consecutivos "ancorado no presente" (precisa de folga antes do início da janela).
 * Não reutiliza `getLogsForPeriod` porque este não precisa de protocol_id/medicine_id/
 * quantity_taken — só `taken_at`, o suficiente pra `evaluateStockUpsell` (@dosiq/core).
 *
 * @param {string} userId
 * @param {number} days
 * @returns {Promise<Array<{ taken_at: string }>>}
 */
export async function getDoseLogDatesForPeriod(userId, days = 30) {
  z.string().uuid().parse(userId)

  const todayStr = getTodayLocal()
  const startUTC = addDays(todayStr, -(days - 1)).toISOString()
  const endUTC = addDays(todayStr, 1).toISOString()

  const { data, error } = await supabase
    .from('medicine_logs')
    .select('taken_at')
    .eq('user_id', userId)
    .gte('taken_at', startUTC)
    .lt('taken_at', endUTC)

  if (error) throw error
  return data ?? []
}

/**
 * 121 A (smoke 2026-11-15): início da jornada GLP-1 — o `start_date` mais antigo entre TODOS os
 * tratamentos (ativos e encerrados) cujo medicamento é wedge. Troca Ozempic → Mounjaro com o antigo
 * encerrado não pode encurtar a janela "Tratamento" do peso. Lido só ao abrir essa janela.
 * Conjunto pequeno por usuário (dezenas de protocolos), longe do teto de ~1000 linhas (AP-186).
 * R-295: colunas e FK `protocols_medicine_id_fkey` verificadas no QA em 2026-11-15.
 */
export async function getGlp1JourneyStart(userId) {
  z.string().uuid().parse(userId)
  const { data, error } = await supabase
    .from('protocols')
    .select('start_date, medicine:medicines(therapeutic_class_code)')
    .eq('user_id', userId)
  if (error) throw error
  const starts = (data ?? [])
    .filter((p) => p.start_date && classifyWedge(p.medicine?.therapeutic_class_code) === 'glp1_antiobesidade')
    .map((p) => p.start_date)
    .sort()
  return starts[0] ?? null
}

/**
 * 125 fatia 2 (AC6.3 · Q-2): remédios criados nos últimos `days` dias, com os tratamentos (ativos ou
 * pausados) embutidos — o card "Falta 1 passo" só entra para quem não tem nenhum. Best-effort no chamador (`.catch(() => [])`). R-295: `created_at`
 * timestamptz com SELECT de `authenticated` em prod e QA (MCP 2026-11-19).
 * @param {string} userId
 * @param {number} days
 */
export async function getRecentMedicines(userId, days) {
  z.string().uuid().parse(userId)
  z.number().int().positive().parse(days)
  const since = addDays(parseLocalDate(getTodayLocal()), -days).toISOString()
  const { data, error } = await supabase
    .from('medicines')
    // Smoke 20/11: tratamento PAUSADO também conta — "Falta 1 passo" é só para remédio sem NENHUM tratamento
    // (a Hoje só carrega os ativos). Embed pela FK única protocols.medicine_id → medicines.id (prod e QA
    // 2026-11-20, pg_constraint); `protocols.id` com SELECT de `authenticated`.
    // Smoke 20/11: excluir é ARQUIVAR (`archived_at`) — remédio e tratamento. Remédio arquivado sai; tratamento
    // arquivado não conta como "tem tratamento". Colunas e SELECT de `authenticated` conferidos em prod e QA.
    // Fix 125 (smoke 124 B, 24/11): remédio de escada (etapa passada OU futura) ou já usado não é "falta
    // configurar". FK única titration_steps→medicines e medicine_logs→medicines, SELECT de `authenticated`
    // (prod e QA, pg_constraint/has_table_privilege 2026-11-24). Só o id e 1 linha de cada (existência).
    .select('id, name, presentation, created_at, protocols(id, archived_at), titration_steps(id), medicine_logs(id)')
    .eq('user_id', userId)
    .is('archived_at', null)
    .gte('created_at', since)
    .limit(1, { referencedTable: 'titration_steps' })
    .limit(1, { referencedTable: 'medicine_logs' })
    .order('created_at')

  if (error) throw error
  return (data ?? []).map((m: any) => ({
    ...m,
    protocols: Array.isArray(m.protocols) ? m.protocols.filter((p: any) => p?.archived_at == null) : m.protocols,
  }))
}
