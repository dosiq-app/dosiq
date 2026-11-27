// apps/web/src/views/admin/ReactivationAdmin.tsx
// Painel do push one-shot de reativação (spec 126): cola a coorte, escolhe a variante, simula e envia.
// A tela só exibe o que o servidor devolve; elegibilidade e "uma tentativa por conta" são do handler.

import { ArrowLeft, Send, FlaskConical, AlertTriangle } from 'lucide-react'
import Button from '@shared/components/ui/Button'
import { useReactivationAdminState } from './useReactivationAdminState'
import { CONFIRM_TOKEN, COHORT_MAX, TITLE_MAX, BODY_MAX } from './reactivationFormUtils'
import type { ReactivationSkipReason, ReactivationVariant } from '@services/api/reactivationAdminService'
import './ReactivationAdmin.css'

const VARIANT_KEYS: ReactivationVariant[] = ['A', 'B', 'C', 'D', 'E']

const VARIANT_SEGMENT: Record<ReactivationVariant, string> = {
  A: 'Novidade concreta · S1, S2',
  B: 'Erro admitido · S1 (cadastro incoerente)',
  C: 'Um toque · S2',
  D: 'Retomada sem culpa · S3',
  E: 'Pessoal (criador) · todos',
}

const SKIP_LABEL: Record<ReactivationSkipReason, string> = {
  already_sent: 'Já recebeu',
  consent_revoked: 'Consentimento revogado (ou ilegível)',
  push_disabled: 'Push desligado nas preferências',
  no_eligible_device: 'Sem aparelho ativo na versão mínima',
  quiet_hours: 'Horário silencioso agora (pode receber depois)',
}

function SkippedTable({ skipped }: { skipped: Array<{ user_id: string; reason: ReactivationSkipReason }> }) {
  if (skipped.length === 0) return null
  return (
    <table className="reactivation-admin__table">
      <thead>
        <tr><th>Conta</th><th>Motivo</th></tr>
      </thead>
      <tbody>
        {skipped.map((s) => (
          <tr key={s.user_id}>
            <td className="reactivation-admin__mono">{s.user_id}</td>
            <td>{SKIP_LABEL[s.reason]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReasonSummary({ byReason }: { byReason: Partial<Record<ReactivationSkipReason, number>> }) {
  const entries = Object.entries(byReason) as Array<[ReactivationSkipReason, number]>
  if (entries.length === 0) return <p className="reactivation-admin__muted">Nenhuma conta pulada.</p>
  return (
    <ul className="reactivation-admin__reasons">
      {entries.map(([reason, count]) => <li key={reason}><strong>{count}</strong> · {SKIP_LABEL[reason]}</li>)}
    </ul>
  )
}

export default function ReactivationAdmin({ onBack }: { onBack: () => void }) {
  const s = useReactivationAdminState()
  const copy = s.variants?.[s.variant]

  return (
    <div className="reactivation-admin">
      <header className="reactivation-admin__header">
        <div>
          <h1>Reativação (push único)</h1>
          <p className="reactivation-admin__subtitle">Uma tentativa por conta. Simule antes de enviar.</p>
        </div>
        <button type="button" className="reactivation-admin__back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </header>

      <section className="reactivation-admin__card">
        <div className="reactivation-admin__field">
          <label htmlFor="reactivation-cohort">Coorte (uids separados por vírgula, espaço ou linha)</label>
          <textarea
            id="reactivation-cohort"
            value={s.cohortText}
            onChange={(e) => s.setCohortText(e.target.value)}
            rows={6}
            maxLength={12000}
            placeholder="a9f3e1c2-1111-4222-8333-944455556666"
          />
          <p className="reactivation-admin__muted" data-testid="cohort-summary">
            {s.cohort.valid.length} conta(s) válida(s)
            {s.cohort.duplicates > 0 ? ` · ${s.cohort.duplicates} repetida(s) ignorada(s)` : ''}
            {s.cohort.valid.length > COHORT_MAX ? ` · acima do limite de ${COHORT_MAX}` : ''}
          </p>
          {s.cohort.invalid.length > 0 && (
            <p className="reactivation-admin__warn">Ignorado(s), não é uid: {s.cohort.invalid.join(', ')}</p>
          )}
        </div>

        <div className="reactivation-admin__field">
          <span className="reactivation-admin__label">Variante</span>
          <div className="reactivation-admin__variants" role="radiogroup" aria-label="Variante">
            {VARIANT_KEYS.map((key) => (
              <label key={key} className={`reactivation-admin__variant ${s.variant === key ? 'reactivation-admin__variant--active' : ''}`}>
                <input type="radio" name="variant" value={key} checked={s.variant === key} onChange={() => s.setVariant(key)} />
                <span className="reactivation-admin__variant-key">{key}</span>
                <span className="reactivation-admin__muted">{VARIANT_SEGMENT[key]}</span>
              </label>
            ))}
          </div>
          {copy && (
            <div className="reactivation-admin__preview" data-testid="variant-preview">
              <strong>{copy.title}</strong> <span className="reactivation-admin__muted">({copy.title.length}/{TITLE_MAX})</span>
              <p>{copy.body} <span className="reactivation-admin__muted">({copy.body.length}/{BODY_MAX})</span></p>
            </div>
          )}
        </div>

        <div className="reactivation-admin__field">
          <label htmlFor="reactivation-min">Versão mínima do app (X.Y.Z)</label>
          <input id="reactivation-min" type="text" maxLength={16} value={s.minVersion} onChange={(e) => s.setMinVersion(e.target.value)} />
          {!s.versionOk && <p className="reactivation-admin__warn">Versão inválida.</p>}
        </div>

        <Button onClick={s.simulate} variant="secondary" disabled={!s.canSimulate}>
          <FlaskConical size={14} /> {s.loading === 'simulate' ? 'Simulando…' : 'Simular'}
        </Button>
      </section>

      {s.message && (
        <p className={`reactivation-admin__message reactivation-admin__message--${s.message.type}`} role="status">{s.message.text}</p>
      )}

      {s.staleSimulation && (
        <p className="reactivation-admin__warn">Os campos mudaram depois da simulação. Simule de novo para liberar o envio.</p>
      )}

      {s.simulation && (
        <section className="reactivation-admin__card" data-testid="simulation">
          <h2>Simulação · variante {s.simulation.variant} · versão ≥ {s.simulation.min_version}</h2>
          <p><strong>{s.simulation.would_send.length}</strong> de {s.simulation.cohort} receberiam.</p>
          <ReasonSummary byReason={s.simulation.skipped_by_reason} />
          <SkippedTable skipped={s.simulation.skipped} />

          {s.simulation.would_send.length > 0 && (
            <div className="reactivation-admin__confirm">
              <AlertTriangle size={18} />
              <div>
                <p>Envio real para {s.simulation.would_send.length} conta(s). Não há reenvio: quem receber fica fora de qualquer disparo futuro.</p>
                <label htmlFor="reactivation-confirm">Digite {CONFIRM_TOKEN} para liberar</label>
                <input id="reactivation-confirm" type="text" maxLength={16} value={s.confirmText} onChange={(e) => s.setConfirmText(e.target.value)} autoComplete="off" />
                <Button onClick={s.send} variant="primary" disabled={!s.canSend}>
                  <Send size={14} /> {s.loading === 'send' ? 'Enviando…' : 'Enviar'}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {s.result && (
        <section className="reactivation-admin__card" data-testid="send-result">
          <h2>Resultado do envio</h2>
          <p><strong>{s.result.sent.length}</strong> enviado(s) · {s.result.skipped.length} pulado(s)</p>
          {s.result.unlogged.length > 0 && (
            <p className="reactivation-admin__warn">
              {s.result.unlogged.length} conta(s) receberam sem registro no histórico e podem receber de novo: {s.result.unlogged.join(', ')}
            </p>
          )}
          <table className="reactivation-admin__table">
            <thead><tr><th>Conta</th><th>Entregues</th><th>Falhas</th></tr></thead>
            <tbody>
              {s.result.sent.map((r) => (
                <tr key={r.user_id}><td className="reactivation-admin__mono">{r.user_id}</td><td>{r.delivered}</td><td>{r.failed}</td></tr>
              ))}
            </tbody>
          </table>
          <ReasonSummary byReason={s.result.skipped_by_reason} />
        </section>
      )}
    </div>
  )
}
