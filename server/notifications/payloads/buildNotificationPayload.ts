// Constrói payload canônico de notificação a partir de evento de domínio
// Todos os canais (Telegram, Expo) consomem este shape normalizado

import type { z } from 'zod';

import { getServerTimestamp } from '../../utils/dateUtils.js';

import { escapeMarkdownV2 } from '../../utils/formatters.js';

import { DOSAGE_UNIT_LABELS, INTAKE_UNIT_LABELS, doseVerb, getKnownInjectionSiteLabel } from '@dosiq/core';

import {
  kindSchema,
  notificationPayloadSchema,
  actionSchema,
  metadataSchema,
  doseReminderDataSchema,
  doseReminderByPlanDataSchema,
  doseReminderMiscDataSchema
} from './_payloadSchemas.js';

export { kindSchema, notificationPayloadSchema, actionSchema, metadataSchema };

import {
  buildDailyDigestPayload,
  buildAdherenceReportPayload,
  buildWeeklyAdherencePayload,
  buildStockAlertPayload,
  buildStockExpiryAlertPayload,
  buildSupplyReminderPayload,
  buildTitrationAlertPayload,
  buildMonthlyReportPayload,
  buildPrescriptionAlertPayload,
  buildDlqDigestPayload,
  buildConsentPruneNoticePayload,
  buildPruneAdminAlertPayload
} from './_payloadBuilders.js';

type Kind = z.infer<typeof kindSchema>;

interface NotificationPayloadContent {
  title: string;
  body: string;
  pushBody: string;
  actions?: Array<z.input<typeof actionSchema>>;
  metadata?: Metadata;
}

interface NotificationContext {
  correlationId?: string;
  details?: Record<string, unknown>;
  isRetry?: boolean;
}

// Shape amplo dos dados de evento de domínio — cada builder valida (via zod)
// só os campos que realmente usa; os demais campos aqui são acesso oportunista
// (deeplink/metadata) e por isso ficam opcionais.
interface NotificationEventData {
  scheduledTime?: string;
  time?: string;
  protocolId?: string;
  protocolIds?: string[];
  planId?: string;
  planName?: string;
  medicineName?: string;
  percentage?: number;
  nudge?: string;
  critical_alarm?: boolean;
  /** 082 Slice C (FR-013b) — ver `metadataSchema.suppress_push_reason`. */
  suppress_push_reason?: 'native_alarm' | 'no_alarm_evidence';
  doses?: Array<{ protocolId?: string; instanceId?: string | null; [key: string]: unknown }>;
  /** 082 D2 — ver `metadataSchema.doseInstanceIds`. */
  doseInstanceIds?: string[];
  [key: string]: unknown;
}

type Metadata = z.infer<typeof metadataSchema>;

/**
 * Centralizador de construção de payloads de notificação.
 * Garante que todas as mensagens sigam o mesmo padrão visual e de escape.
 */
// `actions` é opcional: só os kinds interativos a devolvem (029 F5 — titration_alert do
// medicine_switch). `_buildPayloadContent` espalha o retorno, então elas fluem sem caso especial.
const PAYLOAD_BUILDERS: Record<string, (data: NotificationEventData) => { title: string; body: string; pushBody: string; actions?: Array<z.input<typeof actionSchema>> }> = {
  daily_digest: (data) => buildDailyDigestPayload(data as never),
  adherence_report: (data) => buildAdherenceReportPayload(data as never),
  weekly_adherence: (data) => buildWeeklyAdherencePayload(data as never),
  stock_alert: (data) => buildStockAlertPayload(data as never),
  stock_expiry_alert: (data) => buildStockExpiryAlertPayload(data as never),
  supply_reminder: (data) => buildSupplyReminderPayload(data as never),
  titration_alert: (data) => buildTitrationAlertPayload(data as never),
  monthly_report: (data) => buildMonthlyReportPayload(data as never),
  prescription_alert: (data) => buildPrescriptionAlertPayload(data as never),
  dlq_digest: (data) => buildDlqDigestPayload(data as never),
  consent_prune_notice: (data) => buildConsentPruneNoticePayload(data as never),
  prune_admin_alert: (data) => buildPruneAdminAlertPayload(data as never),
};

// Auxiliar para direcionar a construção do payload conforme o kind.
function _buildPayloadContent(kind: Kind, data: NotificationEventData, metadata: Metadata): NotificationPayloadContent {
  if (kind === 'dose_reminder') {
    return formatDoseReminder(data, metadata);
  }
  if (kind === 'dose_reminder_by_plan') {
    return formatDoseReminderByPlan(data, metadata);
  }
  if (kind === 'dose_reminder_misc') {
    return formatDoseReminderMisc(data, metadata);
  }

  const builder = PAYLOAD_BUILDERS[kind];
  if (!builder) {
    throw new Error(`Unknown notification kind: ${kind}`);
  }
  return { ...builder(data), metadata };
}

export function buildNotificationPayload({ kind, data, context = {} }: { kind: string; data: NotificationEventData; context?: NotificationContext }) {
  // 1. Validar Kind
  const validatedKind = kindSchema.parse(kind);

  const metadata = buildMetadata(validatedKind, context, data);
  const content = _buildPayloadContent(validatedKind, data, metadata);

  const title = content.title;
  const body = content.body;
  const pushBody = content.pushBody;
  const actions = content.actions || [];

  // 2. Resolver Deeplink lógico (Responsabilidade da Layer 2)
  const deeplink = resolveDeeplink(validatedKind, data);

  // 120 B (E-12): reenvio NÃO muda o texto visível — "(Reenvio)" era linguagem de sistema. A
  // identidade do reenvio fica no `context.isRetry` (log/dedupe não comparam pelo título).

  // Validação do Contrato de Saída (Gate L2 -> L3)
  return notificationPayloadSchema.parse({
    title,
    body,
    pushBody,
    deeplink,
    actions,
    metadata
  });
}

// 120 B (D-9 · copy-matrix-B.md): o título carrega a ação e o nome; o corpo, só dose e hora.
// O mesmo texto vale para push, Telegram e Inbox — exceto o local da última aplicação, que vai
// SÓ no `pushBody` (ADR-124; o `body` é o do Telegram e o que a Inbox grava/mostra).
const SEP = ' · ';
const MAX_SHOWN = 10;

const formatNumber = (n: number): string => String(n).replace('.', ',');

// 120 B (smoke C-B1): espaço inquebrável DENTRO da dose — a quebra de linha só cai entre itens,
// nunca em "Selozok 2 / × 25 mg".
const NBSP = '\u00A0';

/**
 * Quantidade da dose, sem o nome do remédio. Exemplos: "50 mg" · "2 × 25 mcg" · "20 gotas" ·
 * "10 UI" · "1,5 un.". Sem nenhuma informação de dose ⇒ null (o corpo fica só com a hora).
 */
const isPositive = (n: number | undefined | null): n is number => n !== undefined && n !== null && n > 0;

const unitLabelOf = (labels: Record<string, string>, unit: string): string => labels?.[unit] || unit;

const formatDoseAmount = (
  qty: number | undefined | null,
  dosagePerPill: number | undefined | null,
  unit: string | undefined,
  intakeUnit: string | undefined | null,
  dosage?: string,
): string | null => {
  // Líquidos (022): unidade de tomada real (gotas/ml/UI), sem a concentração.
  if (intakeUnit && isPositive(qty)) {
    return `${formatNumber(qty)}${NBSP}${unitLabelOf(INTAKE_UNIT_LABELS as Record<string, string>, intakeUnit)}`;
  }
  if (isPositive(dosagePerPill) && unit) {
    // 012 Fase D (FR-015b c): case canônico do acrônimo ('ui' → 'UI'); sem label → unit cru.
    const strength = `${formatNumber(dosagePerPill)}${NBSP}${unitLabelOf(DOSAGE_UNIT_LABELS as Record<string, string>, unit)}`;
    return isPositive(qty) && qty !== 1 ? `${formatNumber(qty)}${NBSP}×${NBSP}${strength}` : strength;
  }
  if (dosage) return dosage;
  return isPositive(qty) ? `${formatNumber(qty)}${NBSP}un.` : null;
};

type DoseLike = {
  medicineName: string;
  dosagePerIntake?: number;
  dosagePerPill?: number | null;
  dosageUnit?: string;
  intakeUnit?: string | null;
};

const formatDoseItem = (d: DoseLike): string => {
  const amount = formatDoseAmount(d.dosagePerIntake, d.dosagePerPill, d.dosageUnit, d.intakeUnit);
  return amount ? `${d.medicineName} ${amount}` : d.medicineName;
};

const isWeeklyInjectable = (presentation: string | null | undefined, frequency: string | null | undefined): boolean =>
  presentation === 'injetavel' && frequency === 'semanal';

/**
 * Formata payload de lembrete de dose única.
 */
function formatDoseReminder(data: NotificationEventData, metadata: Metadata): NotificationPayloadContent {
  const result = doseReminderDataSchema.safeParse(data);
  if (result.success === false) {
    throw new Error(`Invalid data for dose_reminder: ${result.error.message}`);
  }

  const {
    medicineName, time, dosage, protocolId, critical_alarm, dosagePerIntake, dosageUnit, dosagePerPill, intakeUnit,
    presentation, frequency, lastInjectionSite,
  } = result.data;
  const isCritical = critical_alarm === true;
  const verb = doseVerb(presentation);
  const weeklyInjectable = isWeeklyInjectable(presentation, frequency);

  let title: string;
  if (isCritical) title = `💊 Essencial: ${verb} ${medicineName}`;
  else if (weeklyInjectable) title = `Dia da aplicação de ${medicineName}`;
  else title = `Hora de ${verb} ${medicineName}`;

  const amount = formatDoseAmount(dosagePerIntake, dosagePerPill, dosageUnit, intakeUnit, dosage);
  const detail = [amount, time].filter((part): part is string => Boolean(part));
  // ADR-124 / RC-SEC S-2: só o rótulo canônico; valor fora do enum ⇒ trecho omitido.
  const siteLabel = weeklyInjectable ? getKnownInjectionSiteLabel(lastInjectionSite) : null;

  const body = escapeMarkdownV2(detail.join(SEP));
  const pushBody = [...detail, ...(siteLabel ? [`última: ${siteLabel}`] : [])].join(SEP);

  const actions: Array<z.input<typeof actionSchema>> = [
    { id: 'take', label: '✅ Registrar', params: { protocolId: protocolId ?? '', dosage: dosagePerIntake ?? 1 } },
    { id: 'snooze', label: '⏰ Soneca', params: { protocolId: protocolId ?? '' } },
    { id: 'skip', label: '⏭️ Pular', params: { protocolId: protocolId ?? '' } }
  ];

  return { title, body, pushBody, actions, metadata };
}

const dosesWord = (count: number): string => `${count} dose${count === 1 ? '' : 's'} agora`;

/**
 * Lista das doses de um bloco: push em linha única (cabe no banner), Telegram uma por linha.
 */
function formatDoseList(doses: DoseLike[]): { plain: string; markdown: string } {
  const shown = doses.slice(0, MAX_SHOWN);
  const extra = doses.length - shown.length;
  const items = shown.map(formatDoseItem);
  let plain = items.join(SEP);
  let markdown = items.map((item) => `  – ${escapeMarkdownV2(item)}`).join('\n');
  if (extra > 0) {
    plain += `${SEP}e mais ${extra}`;
    markdown += `\n  _e mais ${escapeMarkdownV2(String(extra))}_`;
  }
  return { plain, markdown };
}

/**
 * Formata payload de lembrete de doses por plano.
 */
function formatDoseReminderByPlan(data: NotificationEventData, metadata: Metadata): NotificationPayloadContent {
  const result = doseReminderByPlanDataSchema.safeParse(data);
  if (result.success === false) {
    throw new Error(`Invalid data for dose_reminder_by_plan: ${result.error.message}`);
  }

  const { planName, planId, scheduledTime, doses, critical_alarm } = result.data;
  const isCritical = critical_alarm === true;
  const plan = planName || 'Plano de tratamento';
  const list = formatDoseList(doses);

  let title: string, body: string, pushBody: string;
  if (isCritical) {
    title = '📂 Plano essencial';
    body = `*${escapeMarkdownV2(plan)}*${escapeMarkdownV2(SEP + scheduledTime)}\n\n${list.markdown}`;
    pushBody = [plan, scheduledTime, list.plain].join(SEP);
  } else {
    title = `${dosesWord(doses.length)}${SEP}${plan}`;
    body = `${escapeMarkdownV2(scheduledTime)}\n\n${list.markdown}`;
    pushBody = [scheduledTime, list.plain].join(SEP);
  }

  const planIdShort = String(planId ?? '').slice(0, 8);
  const actions: Array<z.input<typeof actionSchema>> = [
    { id: 'take_plan', label: '✅ Registrar este plano', params: { planIdShort, hhmm: scheduledTime } }
  ];

  return { title, body, pushBody, actions, metadata };
}

/**
 * Formata payload de lembrete de doses avulsas (misc).
 */
function formatDoseReminderMisc(data: NotificationEventData, metadata: Metadata): NotificationPayloadContent {
  const result = doseReminderMiscDataSchema.safeParse(data);
  if (result.success === false) {
    throw new Error(`Invalid data for dose_reminder_misc: ${result.error.message}`);
  }

  const { scheduledTime, doses, critical_alarm } = result.data;
  const isCritical = critical_alarm === true;
  const list = formatDoseList(doses);

  const title = isCritical ? '📋 Doses essenciais' : dosesWord(doses.length);
  const body = `${escapeMarkdownV2(scheduledTime)}\n\n${list.markdown}`;
  const pushBody = [scheduledTime, list.plain].join(SEP);

  const hhmm = scheduledTime;
  const actions: Array<z.input<typeof actionSchema>> = [
    { id: 'take_misc', label: '✅ Registrar todos', params: { hhmm } }
  ];

  return { title, body, pushBody, actions, metadata };
}

interface NavigationMetadata {
  screen: string;
  params: Record<string, unknown>;
}

function getNavigationMetadata(kind: Kind, data: NotificationEventData, protocolIds: string[]): NavigationMetadata {
  const at = data.scheduledTime || data.time || 'now'

  const routes: Record<string, NavigationMetadata> = {
    dose_reminder: { screen: 'dose-individual', params: { protocolId: data.protocolId, at } },
    dose_reminder_by_plan: { screen: 'bulk-plan', params: { planId: data.planId, treatmentPlanName: data.planName, at } },
    dose_reminder_misc: { screen: 'bulk-misc', params: { protocolIds, at } },
    stock_alert: { screen: 'stock', params: {} },
    stock_expiry_alert: { screen: 'stock', params: {} },
    prescription_alert: { screen: 'stock', params: {} },
    adherence_report: { screen: 'history', params: {} },
    weekly_adherence: { screen: 'history', params: {} },
    monthly_report: { screen: 'history', params: {} },
    daily_digest: { screen: 'history', params: {} },
    dlq_digest: { screen: 'admin/dlq', params: {} },
    // 046 Slice C: leva ao hub onde ele resolve (reconsentir/exportar/excluir). Cair no default
    // 'today' seria jogar um titular REVOGADO na tela que o gate mantém bloqueada — o aviso pede
    // uma ação e o toque não levaria a lugar nenhum.
    consent_prune_notice: { screen: 'privacy-data', params: {} },
  }

  // 105 (FR-013 reescrito, C-12): destino = detalhe do tratamento de origem. O app decide a tela final
  // (escada com estoque ligado ⇒ estoque do próximo medicamento, Fatia B) a partir do `protocolId` e do
  // `supply` — nunca de um `medicine_id` no push (E-14). App sem suporte (frota atual) cai no Hoje.
  if (kind === 'supply_reminder') {
    return {
      screen: 'treatment-detail',
      params: { ...(data.protocolId ? { protocolId: data.protocolId } : {}), supply: data.reason },
    }
  }

  return routes[kind] || { screen: 'today', params: {} }
}

/**
 * Constrói objeto de metadados conforme whitelist estrita de `metadataSchema`.
 * Nenhum campo além dos definidos no schema é permitido (Gate 6).
 */
function buildMetadata(kind: Kind, context: NotificationContext, data: NotificationEventData = {}): Metadata {
  // Extrair protocolIds se for um array ou se estiver em data.doses (para grouped/misc)
  let protocolIds = data.protocolIds || []
  if (protocolIds.length === 0 && Array.isArray(data.doses)) {
    protocolIds = data.doses.map((d) => d.protocolId).filter((id): id is string => Boolean(id))
  }

  const navigation = getNavigationMetadata(kind, data, protocolIds)

  // 082 D2: blocos (plano/misc) trazem o id em cada dose; o single, em `doseInstanceIds`.
  const doseInstanceIds = (data.doseInstanceIds ?? (Array.isArray(data.doses) ? data.doses.map((d) => d.instanceId) : []))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const rawMetadata = {
    kind,
    builtAt: getServerTimestamp(),
    navigation, // Objeto esperado pelo usePushNotifications do Mobile
    correlationId: context.correlationId,
    details: context.details,
    // Campos de negócio para persistência (Inbox/Logs)
    protocolId: data.protocolId,
    protocolIds: protocolIds.length > 0 ? protocolIds : undefined,
    medicineName: data.medicineName,
    planId: data.planId,
    planName: data.planName,
    percentage: data.percentage,
    nudge: data.nudge,
    critical_alarm: data.critical_alarm,
    // FR-013b — viaja do reminder (quem tem o `instanceId` de cada dose) até o canal.
    suppress_push_reason: data.suppress_push_reason,
    doseInstanceIds: doseInstanceIds.length > 0 ? doseInstanceIds : undefined,
  }

  // Remove chaves com valor undefined
  return metadataSchema.parse(Object.fromEntries(Object.entries(rawMetadata).filter((entry) => entry[1] !== undefined)))
}

/**
 * Resolve o deeplink canônico para cada tipo de notificação.
 * Centraliza a lógica de rotas e parâmetros.
 */
function resolveDeeplink(kind: Kind, data: NotificationEventData): string {
  const BASE_URL = 'dosiq://';
  
  // 1. Mapeamento de rotas estáticas
  const staticRoutes: Record<string, string> = {
    adherence_report: 'history',
    weekly_adherence: 'history',
    monthly_report: 'history',
    stock_alert: 'stock',
    stock_expiry_alert: 'stock',
    prescription_alert: 'stock',
    dlq_digest: 'admin/dlq',
    // Leva direto ao hub onde ele resolve: reconsentir, exportar ou excluir (008/§Privacidade).
    consent_prune_notice: 'settings/privacy'
  };

  if (staticRoutes[kind]) {
    return `${BASE_URL}${staticRoutes[kind]}`;
  }

  // 2. Rotas dinâmicas com parâmetros
  switch (kind) {
    case 'dose_reminder':
      return data.protocolId 
        ? `${BASE_URL}today?protocolId=${data.protocolId}` 
        : `${BASE_URL}today`;

    case 'dose_reminder_by_plan':
      return data.planId
        ? `${BASE_URL}today?bulkMode=plan&planId=${data.planId}&at=${data.scheduledTime || 'now'}`
        : `${BASE_URL}today`;

    case 'dose_reminder_misc': {
      const pids = data.protocolIds?.join(',') || '';
      return `${BASE_URL}today?bulkMode=misc&at=${data.scheduledTime || 'now'}${pids ? `&protocolIds=${pids}` : ''}`;
    }

    case 'supply_reminder':
      return data.protocolId ? `${BASE_URL}treatment?protocolId=${data.protocolId}` : `${BASE_URL}today`;

    default:
      return `${BASE_URL}today`;
  }
}
