import { describe, it, expect } from 'vitest';
import { buildNotificationPayload } from '../buildNotificationPayload';

describe('buildNotificationPayload', () => {

  describe('daily_digest', () => {
    it('should generate rich body for Telegram and plain body for Push', () => {
      const data = {
        firstName: 'Antonio Coelho',
        hour: 16,
        pendingCount: 1,
        medicines: [{ name: 'Ansitec', time: '11:45', dosage: '1 mg' }]
      };

      const payload = buildNotificationPayload({ kind: 'daily_digest', data });

      // Verificação Rich (Telegram)
      expect(payload.body).toContain('*Antonio Coelho*');
      expect(payload.body).toContain('\\!'); // Escapado para MarkdownV2 (JSON string representation)
      // Note: in Vitest, we check the actual string content.
      // Since buildNotificationPayload uses template literals with \\!, the string has literal \!
      expect(payload.body).toMatch(/Antonio Coelho\*/);
      expect(payload.body).toContain('\n\n'); // Newlines reais

      // Verificação Plain (Push)
      expect(payload.pushBody).not.toContain('*');
      expect(payload.pushBody).not.toContain('\\!');
      expect(payload.pushBody).toContain('Antonio Coelho!');
      expect(payload.pushBody).toContain('\n'); // Verificamos que contém ao menos uma quebra de linha
    });

    // 012 Fase D (FR-015b): dose líquida no digest via formatters core (R-272) —
    // unidade de tomada real + case canônico, nunca "1 un." lossy.
    it('should render liquid dose with canonical intake unit (UI), not "1 un."', () => {
      const data = {
        firstName: 'Maria',
        hour: 8,
        pendingCount: 1,
        medicines: [{
          name: 'Lantus', time: '12:00',
          dosagePerIntake: 10, intakeUnit: 'UI',
          dosageUnit: 'ui/ml', dosagePerPill: 100, unitsPerMl: 100
        }]
      };
      const payload = buildNotificationPayload({ kind: 'daily_digest', data });
      expect(payload.pushBody).toContain('10 UI');
      expect(payload.pushBody).not.toContain('1 un.');
      expect(payload.pushBody).not.toContain('10 ui'); // case canônico
    });

    it('should render solid dose via active-ingredient hint, not crashing', () => {
      const data = {
        firstName: 'Ana', hour: 8, pendingCount: 1,
        medicines: [{
          name: 'Dipirona', time: '09:00',
          dosagePerIntake: 2, dosageUnit: 'mg', dosagePerPill: 500
        }]
      };
      const payload = buildNotificationPayload({ kind: 'daily_digest', data });
      expect(payload.pushBody).toContain('Dipirona');
      expect(payload.pushBody).toContain('09:00');
    });

    it('should omit dosage when dosagePerIntake is absent (guard)', () => {
      const data = {
        firstName: 'Caio', hour: 8, pendingCount: 1,
        medicines: [{ name: 'Omega 3', time: '07:00' }]
      };
      const payload = buildNotificationPayload({ kind: 'daily_digest', data });
      expect(payload.pushBody).toContain('Omega 3');
      expect(payload.pushBody).not.toContain('()');
    });

    it('should handle zero pending doses correctly', () => {
      const data = {
        firstName: 'Caio',
        hour: 8,
        pendingCount: 0,
        medicines: []
      };

      const payload = buildNotificationPayload({ kind: 'daily_digest', data });
      expect(payload.pushBody).toContain('Você está em dia');
      expect(payload.pushBody).not.toContain('\\!');
    });
  });

  describe('adherence_report', () => {
    it('should generate dual formats for adherence report', () => {
      const data = {
        firstName: 'Antonio',
        period: 'hoje',
        percentage: 85,
        taken: 6,
        total: 7,
        storytelling: 'Melhor que ontem!'
      };

      const payload = buildNotificationPayload({ kind: 'adherence_report', data });

      expect(payload.body).toContain('*Antonio*');
      expect(payload.body).toContain('*85%*');
      expect(payload.body).toContain('✅ *6* de *7*');
      
      expect(payload.pushBody).toContain('Olá, Antonio!');
      expect(payload.pushBody).toContain('adesão hoje foi de 85%');
      expect(payload.pushBody).toContain('✅ 6 de 7');
      expect(payload.pushBody).not.toContain('*');
    });
  });

  describe('doseInstanceIds no metadata (082 D2 · smoke T101)', () => {
    it('single: leva os ids do data — o app tira da bandeja o push da dose registrada', () => {
      const payload = buildNotificationPayload({
        kind: 'dose_reminder',
        data: { medicineName: 'Lantus', time: '16:05', doseInstanceIds: ['inst-1'] },
      });
      expect(payload.metadata?.doseInstanceIds).toEqual(['inst-1']);
    });

    it('bloco: deriva dos `instanceId` de cada dose, ignorando vazios', () => {
      const payload = buildNotificationPayload({
        kind: 'dose_reminder_misc',
        data: {
          scheduledTime: '08:00',
          hour: 8,
          doses: [
            { protocolId: 'p1', medicineName: 'A', dosagePerIntake: 1, instanceId: 'a' },
            { protocolId: 'p2', medicineName: 'B', dosagePerIntake: 1, instanceId: null },
          ],
        },
      });
      expect(payload.metadata?.doseInstanceIds).toEqual(['a']);
    });

    it('sem id: o campo não existe', () => {
      const payload = buildNotificationPayload({ kind: 'dose_reminder', data: { medicineName: 'X', time: '09:00' } });
      expect(payload.metadata).not.toHaveProperty('doseInstanceIds');
    });
  });

  // 120 B — oráculo: plans/specs/120-notification-permission-recovery/copy-matrix-B.md (local-only)
  describe('dose_reminder (120 B · copy-matrix §1–2)', () => {
    const base = { time: '08:00', hour: 8, dosagePerIntake: 1, critical_alarm: false };
    const losartana = { ...base, medicineName: 'Losartana', dosagePerPill: 50, dosageUnit: 'mg', presentation: 'comprimido', frequency: 'diário' };
    const mounjaro = { ...base, medicineName: 'Mounjaro', dosagePerPill: 2.5, dosageUnit: 'mg', presentation: 'injetavel', frequency: 'semanal' };
    const build = (data: Parameters<typeof buildNotificationPayload>[0]['data']) => buildNotificationPayload({ kind: 'dose_reminder', data });

    it('1.1 comprimido diário: título com ação, corpo só dose e hora', () => {
      const p = build(losartana);
      expect(p.title).toBe('Hora de tomar Losartana');
      expect(p.pushBody).toBe('50 mg · 08:00');
      expect(p.body).toBe('50 mg · 08:00');
    });

    it('1.2 dois comprimidos por dose ⇒ "2 × 25 mcg"', () => {
      const p = build({ ...losartana, medicineName: 'Vitamina D', dosagePerIntake: 2, dosagePerPill: 25, dosageUnit: 'mcg' });
      expect(p.pushBody).toBe('2 × 25 mcg · 08:00');
    });

    it('1.3 líquido em gotas ⇒ unidade de tomada, sem concentração', () => {
      const p = build({ ...losartana, medicineName: 'Dipirona', presentation: 'liquido', dosagePerIntake: 20, dosagePerPill: 500, dosageUnit: 'mg/ml', intakeUnit: 'gotas' });
      expect(p.title).toBe('Hora de tomar Dipirona');
      expect(p.pushBody).toBe('20 gotas · 08:00');
    });

    it('1.4 injetável diário ⇒ aplicar, UI canônico', () => {
      const p = build({ ...losartana, medicineName: 'Insulina', presentation: 'injetavel', dosagePerIntake: 10, dosagePerPill: 100, dosageUnit: 'ui/ml', intakeUnit: 'UI' });
      expect(p.title).toBe('Hora de aplicar Insulina');
      expect(p.pushBody).toBe('10 UI · 08:00');
    });

    it.each([['pomada', 'aplicar'], ['spray', 'usar'], ['outro', 'usar'], ['capsula', 'tomar'], [null, 'tomar']])(
      '1.5/1.6/1.13 apresentação %s ⇒ %s', (presentation, verb) => {
        expect(build({ ...losartana, presentation }).title).toBe(`Hora de ${verb} Losartana`);
      });

    it('1.7 semanal injetável com local: título de evento, local SÓ no push', () => {
      const p = build({ ...mounjaro, lastInjectionSite: 'abdomen_e' });
      expect(p.title).toBe('Dia da aplicação de Mounjaro');
      expect(p.pushBody).toBe('2,5 mg · 08:00 · última: Abdômen (esquerdo)');
      expect(p.body).toBe('2,5 mg · 08:00');
      expect(p.body).not.toContain('Abdômen');
    });

    it('1.8 semanal injetável sem local ⇒ trecho omitido', () => {
      expect(build({ ...mounjaro, lastInjectionSite: null }).pushBody).toBe('2,5 mg · 08:00');
    });

    it.each(['abdomen', 'ABDOMEN_E', '<b>x</b>', ''])('1.9 local fora do enum (%s) ⇒ omitido, valor cru nunca no texto (PO-SEC-2)', (site) => {
      const p = build({ ...mounjaro, lastInjectionSite: site });
      expect(p.pushBody).toBe('2,5 mg · 08:00');
      expect(`${p.title} ${p.body} ${p.pushBody}`).not.toContain(site || 'última');
    });

    it('1.10 comprimido semanal ⇒ sem título de evento e sem local', () => {
      const p = build({ ...losartana, frequency: 'semanal', lastInjectionSite: 'abdomen_e' });
      expect(p.title).toBe('Hora de tomar Losartana');
      expect(p.pushBody).toBe('50 mg · 08:00');
    });

    it.each(['personalizado', 'diário', null])('1.11 injetável %s ⇒ como diário, sem local', (frequency) => {
      const p = build({ ...mounjaro, frequency, lastInjectionSite: 'abdomen_e' });
      expect(p.title).toBe('Hora de aplicar Mounjaro');
      expect(p.pushBody).toBe('2,5 mg · 08:00');
    });

    it('1.12 sem dose cadastrada ⇒ só a hora', () => {
      const p = build({ medicineName: 'Omega 3', time: '12:00' });
      expect(p.title).toBe('Hora de tomar Omega 3');
      expect(p.pushBody).toBe('12:00');
    });

    it('dose sem força ⇒ "1,5 un."; string de dosagem pré-formatada respeitada', () => {
      expect(build({ medicineName: 'Ansitec', time: '18:00', dosagePerIntake: 1.5 }).pushBody).toBe('1,5 un. · 18:00');
      expect(build({ medicineName: 'Omega 3', time: '12:00', dosage: '3 cp' }).pushBody).toBe('3 cp · 12:00');
    });

    it('2.1/2.2 essencial: "💊 Essencial: {verbo} {nome}"', () => {
      expect(build({ ...losartana, critical_alarm: true }).title).toBe('💊 Essencial: tomar Losartana');
      expect(build({ ...mounjaro, frequency: 'diário', critical_alarm: true }).title).toBe('💊 Essencial: aplicar Mounjaro');
    });

    it('2.3 essencial semanal injetável: título do essencial, local no push', () => {
      const p = build({ ...mounjaro, critical_alarm: true, lastInjectionSite: 'coxa_d' });
      expect(p.title).toBe('💊 Essencial: aplicar Mounjaro');
      expect(p.pushBody).toBe('2,5 mg · 08:00 · última: Coxa (direita)');
      expect(p.body).toBe('2,5 mg · 08:00');
    });

    it('nunca saudação de horário no título', () => {
      for (const hour of [6, 12, 15, 20, 1]) {
        expect(build({ ...losartana, hour }).title).not.toMatch(/Remédios d|Hora dos remédios|Bom dia/);
      }
    });

    it('Telegram: MarkdownV2 escapado no corpo (PO-120-7 guard)', () => {
      const p = build({ ...losartana, medicineName: 'A_b*[c]', dosage: '1.5 cp', dosagePerPill: null, dosagePerIntake: undefined, time: '08:00' });
      expect(p.title).toBe('Hora de tomar A_b*[c]');
      expect(p.body).toBe('1\\.5 cp · 08:00');
    });

    it('5.3 botões do Telegram: "✅ Registrar" com id/params inalterados', () => {
      const p = build({ ...losartana, protocolId: 'p1' });
      expect(p.actions.map((a) => a.id)).toEqual(['take', 'snooze', 'skip']);
      expect(p.actions[0]).toMatchObject({ label: '✅ Registrar', params: { protocolId: 'p1', dosage: 1 } });
    });

    it('5.1 reenvio: texto idêntico ao envio original', () => {
      const first = build({ ...mounjaro, lastInjectionSite: 'abdomen_e' });
      const retry = buildNotificationPayload({ kind: 'dose_reminder', data: { ...mounjaro, lastInjectionSite: 'abdomen_e' }, context: { isRetry: true } });
      expect({ t: retry.title, b: retry.body, p: retry.pushBody }).toEqual({ t: first.title, b: first.body, p: first.pushBody });
      expect(`${retry.title}${retry.body}${retry.pushBody}`).not.toMatch(/Reenvio|nova tentativa/);
    });

    it('5.5 metadata/deeplink do toque inalterados (cenário 4)', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder', data: { ...mounjaro, protocolId: 'p9', doseInstanceIds: ['i1'], lastInjectionSite: 'abdomen_e' } });
      expect(p.deeplink).toBe('dosiq://today?protocolId=p9');
      expect(p.metadata.doseInstanceIds).toEqual(['i1']);
      expect(p.metadata.navigation).toEqual({ screen: 'dose-individual', params: { protocolId: 'p9', at: '08:00' } });
      expect(JSON.stringify(p.metadata)).not.toContain('abdomen');
    });
  });

  describe('dose_reminder_by_plan (120 B · copy-matrix §3)', () => {
    const doses = [
      { medicineName: 'Losartana', dosagePerIntake: 1, dosagePerPill: 50, dosageUnit: 'mg' },
      { medicineName: 'Metformina', dosagePerIntake: 1, dosagePerPill: 500, dosageUnit: 'mg' },
    ];
    const base = { planName: 'Pressão', planId: 'plan_123', scheduledTime: '08:00', hour: 8, doses, critical_alarm: false };

    it('3.1 normal: "N doses agora · plano", push em linha, Telegram uma por linha', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_by_plan', data: base });
      expect(p.title).toBe('2 doses agora · Pressão');
      expect(p.pushBody).toBe('08:00 · Losartana 50 mg · Metformina 500 mg');
      expect(p.body).toBe('08:00\n\n  – Losartana 50 mg\n  – Metformina 500 mg');
      expect(p.actions).toHaveLength(1);
      expect(p.actions[0].id).toBe('take_plan');
    });

    it('3.2 essencial: título mantido, plano no corpo', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_by_plan', data: { ...base, critical_alarm: true } });
      expect(p.title).toBe('📂 Plano essencial');
      expect(p.pushBody).toBe('Pressão · 08:00 · Losartana 50 mg · Metformina 500 mg');
      expect(p.body).toBe('*Pressão* · 08:00\n\n  – Losartana 50 mg\n  – Metformina 500 mg');
    });

    it('3.3 mais de 10 doses ⇒ "e mais N"', () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ medicineName: `Med ${i}`, dosagePerIntake: 1 }));
      const p = buildNotificationPayload({ kind: 'dose_reminder_by_plan', data: { ...base, doses: many } });
      expect(p.title).toBe('12 doses agora · Pressão');
      expect(p.pushBody.endsWith(' · Med 9 1 un. · e mais 2')).toBe(true);
      expect(p.body.endsWith('\n  _e mais 2_')).toBe(true);
    });

    it('3.4 bloco nunca leva local de aplicação', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_by_plan', data: { ...base, doses: [...doses, { medicineName: 'Mounjaro', dosagePerIntake: 1, lastInjectionSite: 'abdomen_e' }] } });
      expect(`${p.body}${p.pushBody}`).not.toMatch(/última|Abdômen|abdomen/);
    });

    it('Telegram escapa nome do plano e dos remédios', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_by_plan', data: { ...base, critical_alarm: true, planName: 'P_1.x', doses: [{ medicineName: 'A(b)', dosagePerIntake: 1 }, { medicineName: 'C', dosagePerIntake: 1 }] } });
      expect(p.body).toBe('*P\\_1\\.x* · 08:00\n\n  – A\\(b\\) 1 un\\.\n  – C 1 un\\.');
    });
  });

  describe('dose_reminder_misc (120 B · copy-matrix §4)', () => {
    const doses = [
      { medicineName: 'Losartana', dosagePerIntake: 1, dosagePerPill: 50, dosageUnit: 'mg' },
      { medicineName: 'Vitamina D', dosagePerIntake: 2, dosagePerPill: 25, dosageUnit: 'mcg' },
    ];

    it('4.1 normal: "N doses agora", sem possessivo', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_misc', data: { scheduledTime: '08:00', hour: 8, doses, critical_alarm: false } });
      expect(p.title).toBe('2 doses agora');
      expect(p.pushBody).toBe('08:00 · Losartana 50 mg · Vitamina D 2 × 25 mcg');
      expect(p.body).toBe('08:00\n\n  – Losartana 50 mg\n  – Vitamina D 2 × 25 mcg');
      expect(p.body).not.toContain('Suas');
      expect(p.actions[0].id).toBe('take_misc');
    });

    it('4.1 singular: "1 dose agora"', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_misc', data: { scheduledTime: '22:00', hour: 22, doses: [{ medicineName: 'Med X', dosagePerIntake: 1.5 }] } });
      expect(p.title).toBe('1 dose agora');
      expect(p.pushBody).toBe('22:00 · Med X 1,5 un.');
    });

    it('4.2 essencial: título mantido', () => {
      const p = buildNotificationPayload({ kind: 'dose_reminder_misc', data: { scheduledTime: '08:00', hour: 8, doses, critical_alarm: true } });
      expect(p.title).toBe('📋 Doses essenciais');
      expect(p.pushBody).toBe('08:00 · Losartana 50 mg · Vitamina D 2 × 25 mcg');
    });

    it('5.1 reenvio do bloco: texto idêntico', () => {
      const data = { scheduledTime: '08:00', hour: 8, doses };
      const a = buildNotificationPayload({ kind: 'dose_reminder_misc', data });
      const b = buildNotificationPayload({ kind: 'dose_reminder_misc', data, context: { isRetry: true } });
      expect([b.title, b.body, b.pushBody]).toEqual([a.title, a.body, a.pushBody]);
    });
  });

  // 012 Fase B2 (FR-021): titulação N1 — etapa cross-força vira CTA de troca.
  // 029 F5 (T025 / FR-004): copy da Evolução do tratamento, dirigida por `transition`.
  // Substitui a copy legada do 012/FR-021, que dizia "caneta" (proibido — §0/§8) e chamava a
  // entidade de "Titulação" (o naming é "Evolução do tratamento").
  describe('titration_alert (Evolução do tratamento — copy §8)', () => {
    const base = {
      medicineName: 'Semaglutida 0,5 mg',
      currentStage: 2,
      totalStages: 3,
    };

    it('medicine_switch → "Etapa N começa hoje" + as 2 ações do card do Hoje', () => {
      const payload = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, transition: 'medicine_switch', stepId: 'step-uuid', dose: 0.5, intakeUnit: 'mg' },
      });
      expect(payload.title).toBe('Etapa 2 começa hoje');
      expect(payload.pushBody).toContain('Semaglutida 0,5 mg');
      expect(payload.pushBody).toContain('Como prescrito pelo seu médico.');
      expect(payload.actions).toEqual([
        { id: 'start_step', label: 'Iniciar etapa', params: { stepId: 'step-uuid' } },
        { id: 'not_yet', label: 'Ainda não', params: { stepId: 'step-uuid' } },
      ]);
    });

    it('medicine_switch SEM stepId → sai sem botão (ação sem alvo falharia no toque)', () => {
      const payload = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, transition: 'medicine_switch' },
      });
      expect(payload.actions).toEqual([]);
    });

    it('dose_change → informativo, SEM botões, dose em pt-BR (§3.4)', () => {
      const payload = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, medicineName: 'Metoprolol 50 mg', transition: 'dose_change', dose: 2, intakeUnit: 'cp' },
      });
      expect(payload.title).toBe('Dose ajustada para 2 comprimidos');
      expect(payload.pushBody).toContain('etapa 2 de 3 da evolução do tratamento, como prescrito.');
      expect(payload.pushBody).toContain('Os lembretes já estão na dose nova.');
      expect(payload.actions).toEqual([]);
    });

    it('dose_change de 1 comprimido → singular', () => {
      const payload = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, transition: 'dose_change', dose: 1, intakeUnit: 'cp' },
      });
      expect(payload.title).toBe('Dose ajustada para 1 comprimido');
    });

    it('target_reached → conclusão factual, sem ações', () => {
      const payload = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, transition: 'target_reached' },
      });
      expect(payload.title).toBe('Evolução do tratamento concluída');
      expect(payload.pushBody).toContain('última etapa prescrita');
      expect(payload.actions).toEqual([]);
    });

    it('SaMD/§8: nunca "caneta", "Titulação" nem "recomendada" em nenhuma transição', () => {
      const proibidos = /caneta|Titula[çc]|recomendad/i;
      for (const transition of ['medicine_switch', 'dose_change', 'target_reached'] as const) {
        const payload = buildNotificationPayload({
          kind: 'titration_alert',
          data: { ...base, transition, dose: 2, intakeUnit: 'cp', stepId: 's' },
        });
        expect(payload.title).not.toMatch(proibidos);
        expect(payload.pushBody).not.toMatch(proibidos);
      }
    });

    // R-193: payload já enfileirado no outbox no momento do deploy não tem `transition`.
    it('compat de outbox: par N1 legado ainda produz a copy nova certa', () => {
      const legadoSwitch = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, status: 'titulando', requiresNewMedicine: true },
      });
      expect(legadoSwitch.title).toBe('Etapa 2 começa hoje');

      const legadoAlvo = buildNotificationPayload({
        kind: 'titration_alert',
        data: { ...base, status: 'alvo_atingido' },
      });
      expect(legadoAlvo.title).toBe('Evolução do tratamento concluída');
    });
  });
});

describe('consent_prune_notice — copy neutra (046 T013d / S8)', () => {
  const build = (data: any) => buildNotificationPayload({ kind: 'consent_prune_notice', data })

  it('não vaza saúde por metadado: nem título, nem preview, nem corpo', () => {
    const p = build({ stage: 'd60', daysLeft: 30 })
    const superficiesVisiveis = `${p.title} ${p.pushBody} ${p.body}`.toLowerCase()
    // A tela de bloqueio mostra título + pushBody a quem estiver olhando o celular por cima do
    // ombro. Nenhuma dessas palavras pode aparecer ali — nem "medicamento" sozinha.
    for (const termo of ['medicament', 'dose', 'remédio', 'tratamento', 'adesão', 'mg', 'comprimido']) {
      expect(superficiesVisiveis).not.toContain(termo)
    }
  })

  it('diz o prazo e o que fazer', () => {
    const p = build({ stage: 'd83', daysLeft: 7 })
    expect(p.title).toBe('Sua conta precisa de uma ação')
    expect(p.pushBody).toContain('7 dias')
    expect(p.pushBody).toContain('autorize novamente')
    expect(p.deeplink).toBe('dosiq://settings/privacy')
  })

  it('leva ao hub de privacidade, não ao "today" — o revogado tem o app bloqueado', () => {
    // Achado do RC6 (pass B): kind novo registrado em kindSchema/PAYLOAD_BUILDERS/resolveDeeplink
    // mas ausente da tabela de navegação cairia no default 'today'. O aviso pede uma ação e o
    // toque não levaria a lugar nenhum.
    const p = build({ stage: 'd60', daysLeft: 30 })
    expect(p.metadata.navigation).toEqual({ screen: 'privacy-data', params: {} })
  })

  it('singulariza o último dia', () => {
    expect(build({ stage: 'd83', daysLeft: 1 }).pushBody).toContain('em 1 dia.')
  })

  it('rejeita payload degenerado em vez de enviar um aviso sem prazo', () => {
    expect(() => build({ stage: 'd60', daysLeft: 0 })).toThrow()
    expect(() => build({ stage: 'd60' })).toThrow()
    expect(() => build({ stage: 'qualquer', daysLeft: 5 })).toThrow()
  })
})


describe('prescription_alert (076 — janela <= band)', () => {
  const build = (daysRemaining: number, endDate = '2026-09-27') =>
    buildNotificationPayload({
      kind: 'prescription_alert',
      data: { protocolId: 'p-1', medicineName: 'Pregabalina', endDate, daysRemaining },
    });

  it('daysRemaining = 0 diz "vence hoje" — nunca "vencendo em 0 dias"', () => {
    const payload = build(0);
    expect(payload.pushBody).toContain('vence hoje');
    expect(payload.body).toContain('vence hoje');
    expect(payload.pushBody).not.toContain('0 dias');
    expect(payload.body).not.toContain('0 dias');
  });

  it('daysRemaining = 1 diz "vence amanhã", sem o ponto solto do escape antigo', () => {
    const payload = build(1);
    expect(payload.pushBody).toContain('vence amanhã!');
    // MarkdownV2: `!` escapa como `\!`. O legado escrevia `\.!`, que renderiza "amanhã.!".
    expect(payload.body).toContain('amanhã\\!');
    expect(payload.body).not.toContain('amanhã\\.!');
  });

  it('degraus 7 e 30 mantêm o copy de sempre', () => {
    expect(build(7).pushBody).toContain('vencendo em 7 dias');
    expect(build(30).pushBody).toContain('Renovação de Prescrição');
  });

  it('protocolId viaja para metadata — é dele que sai notification_log.protocol_id (dedup 076)', () => {
    expect(build(7).metadata?.protocolId).toBe('p-1');
  });
})

describe('prune_admin_alert — só contagens (107 US-2 / S-7)', () => {
  const build = (data: any) => buildNotificationPayload({ kind: 'prune_admin_alert', data })

  it('vermelho no título quando há pendência perto do limite; contagens no corpo', () => {
    const p = build({ overdue: 2, red: 1, emailsDue: 3 })
    expect(p.title).toContain('limite')
    expect(p.pushBody).toContain('2 contas vencidas')
    expect(p.pushBody).toContain('1 a 10 dias ou menos')
    expect(p.pushBody).toContain('3 avisos por e-mail')
    expect(build({ overdue: 1, red: 0, emailsDue: 0 }).title).toBe('Exclusões aguardando decisão')
  })

  it('o schema não aceita nada além de contagens inteiras não-negativas', () => {
    expect(() => build({ overdue: -1, red: 0, emailsDue: 0 })).toThrow()
    expect(() => build({ overdue: 1.5, red: 0, emailsDue: 0 })).toThrow()
    const p = build({ overdue: 1, red: 0, emailsDue: 0, email: 'x@y.z' } as any)
    expect(`${p.title} ${p.pushBody} ${p.body}`).not.toContain('@')
  })
})
