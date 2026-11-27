---
title: "Push único de reativação"
description: "Como montar a coorte, simular, disparar e verificar o push one-shot de reativação (reactivation_notice) pelo admin web, e o que cada motivo de pulo significa."
version: "1.0.0"
status: active
category: operation
audience:
  - dev
  - ops
tags:
  - notifications
  - push
  - admin
  - reativacao
created_at: "2026-11-27"
updated_at: "2026-11-27"
epic: "126"
---

# Guia — Push único de reativação (spec 126)

O push de reativação é um aviso disparado **uma vez, por um operador**, para uma lista fechada de
contas. O toque abre o **Hoje** do app. Não existe agendamento, cron nem reenvio: cada conta recebe
`reactivation_notice` **no máximo uma vez na vida**.

- Painel: admin web → **Configurações → Administração → Reativação (push único)**
- Endpoint: `api/admin?resource=reactivation` (função `api/admin.ts`, sem função nova — R-090)
- Código: `api/admin/_handlers/reactivation.ts` · variantes em
  `server/notifications/payloads/_payloadSchemas.ts` (`REACTIVATION_VARIANTS`)

> ⚠️ **Irreversível.** Quem recebe (ou cuja entrega falha) fica fora de qualquer disparo futuro. Simule
> sempre, e confira o ambiente antes de enviar (§2).

---

## 1. Quando usar

- Para trazer de volta contas que pararam de usar o app, **depois** que a versão com a novidade estiver
  nas lojas. O push só abre o Hoje: se a tela que abre não resolve nada, ele repete o e-mail.
- Dispare só para `app_version` ≥ a versão que tem a novidade (campo **Versão mínima**). Quem ficou
  numa versão antiga é pulado **sem gastar** a tentativa e pode receber num disparo futuro, depois de
  atualizar.
- A ida à loja é papel do **e-mail** (ver `email_reativacao_v034.md`): na frota antiga o push não abre
  link de loja.
- Horário sugerido: terça a quinta, 19h–20h (BRT), fora dos horários de dose.

## 2. Pré-requisitos

| Item | Onde | Por quê |
|---|---|---|
| Conta admin | `ADMIN_USER_ID` = `auth.users.id` de quem opera | Sem ela a rota responde 401 |
| Supabase do ambiente | `SUPABASE_URL`/`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Define **para quem** o push vai |
| Expo | `EXPO_ACCESS_TOKEN` (se o projeto Expo exigir) | Envio pela Expo Push API |

**Smoke e testes vão no QA** (`dosiq-qa`, `ikcvwxyohmntncanclze` — `docs/architecture/QA_ENVIRONMENT.md`).
Antes de clicar em **Enviar** num preview da Vercel, confirme que as env de *Preview* apontam para o
QA: se apontarem para prod, o envio sai para contas reais e queima a tentativa delas.

## 3. Montar a coorte

A coorte é decidida **fora** do sistema (análise de produto) e congelada antes do envio: guarde a
lista de uids com a data, para medir o resultado contra ela.

Consulta de apoio (só leitura; aparelhos expo ativos de quem ainda não recebeu):

```sql
select d.user_id,
       array_agg(d.app_version order by d.app_version) as app_versions,
       count(*) as devices
from public.notification_devices d
where d.provider = 'expo' and d.is_active = true
  and not exists (
    select 1 from public.notification_log l
    where l.user_id = d.user_id and l.notification_type = 'reactivation_notice'
  )
group by d.user_id;
```

- Não filtre versão com `max(app_version)`: comparação de texto erra (`'0.34.10' < '0.34.4'`). O
  servidor compara SemVer; deixe a versão mínima para o painel.
- Tire contas internas e de família antes do envio.
- **Limite: 100 contas por disparo.** O envio é serial (1 push + 1 gravação de log por conta) e precisa
  caber no tempo da função. Coorte maior = vários disparos.

## 4. Variantes

Texto fixo no código. O painel só escolhe a letra; não há texto livre.

| | Título | Corpo |
|---|---|---|
| A | O dosiq ficou mais fácil | Agora o app ajuda a conferir sua rotina em poucos toques. Dá uma olhada? |
| B | A gente melhorou o cadastro | Se algo não bateu da última vez, agora dá para ajustar rapidinho no app. |
| C | Leva 1 minuto | Confira se sua rotina no dosiq está do jeito certo. |
| D | Bom te ver de volta? | Seu histórico continua salvo. Quando quiser, é só abrir. |
| E | Uma mensagem do Coelho | Mudei o dosiq com base em quem usou. Queria que você visse. |

Regras do texto (o push aparece na tela de bloqueio e sai do país pela Expo/APNs/FCM — ADR-118):

- Nenhum remédio, condição, dose ou tratamento, nem palavra que permita inferir que a pessoa trata
  algo (INV-1). Título ≤ 40 e corpo ≤ 110 caracteres (corte do iOS).
- O texto chega **igual** para quem não aceitou a transferência internacional (o kind está em
  `TRANSFER_NEUTRAL_KINDS`). Isso só é aceitável porque as variantes seguem a regra acima.
- Variante nova ou mudança de texto = mudança de código com revisão, nunca texto colado no painel.

## 5. Passo a passo no painel

1. **Coorte:** cole os uids em qualquer formato (vírgula, linha, aspas de CSV/JSON). O painel limpa,
   remove repetidos e lista o que não é uid.
2. **Variante:** escolha a letra; o painel mostra o texto com a contagem de caracteres.
3. **Versão mínima:** ex. `0.35.0`.
4. **Simular.** Nada é enviado. Confira quantas contas receberiam e os pulados por motivo (§6).
5. **Enviar:** só libera depois de simular **exatamente os mesmos campos**. Mudou algo, simule de
   novo. Digite `ENVIAR` e clique uma vez.
6. **Leia o resultado:** enviados (entregues/falhas por conta), pulados e o aviso de contas sem
   registro, se aparecer (§8).

> Não dispare em duas abas ou por dois operadores ao mesmo tempo. A checagem de "já recebeu" não tem
> trava no banco: dois envios simultâneos para a mesma conta podem passar os dois (risco aceito pelo PO
> por ser ato manual único — PR #980).

## 6. Motivos de pulo

| Motivo | Significado | Gasta a tentativa? |
|---|---|---|
| Já recebeu (`already_sent`) | Existe linha `reactivation_notice` no `notification_log`, entregue **ou não** | já gasta |
| Consentimento revogado (`consent_revoked`) | Revogou a autorização de dados de saúde, ou a linha de preferências não pôde ser lida (fail-closed) | não |
| Push desligado (`push_disabled`) | `channel_mobile_push_enabled = false` nas preferências | não |
| Sem aparelho na versão mínima (`no_eligible_device`) | Nenhum aparelho expo ativo com versão ≥ mínima (versão vazia ou ilegível não conta) | não |
| Horário silencioso (`quiet_hours`) | Janela silenciosa ou modo resumo agora — inclusive se a janela abriu no meio do envio | não |

Só os aparelhos da conta que passam na versão mínima recebem; um aparelho antigo da mesma conta não.
O push desligado no sistema (`is_active = false`) nunca é reativado.

## 7. Verificar

**Entrega e registro** (banco do ambiente):

```sql
select user_id, status, created_at
from public.notification_log
where notification_type = 'reactivation_notice'
order by created_at desc;
```

**Toque** (PostHog; em prod filtre `app_env = 'production'`):

```sql
select timestamp, properties.kind, properties.$os
from events
where event = 'push_notification_tapped' and properties.kind = 'reactivation_notice'
order by timestamp desc
```

O aviso também aparece na **caixa de entrada** do app (o log é a inbox). É esperado.

## 8. Problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| 401 | Conta logada não é o `ADMIN_USER_ID` do ambiente | Conferir a env do ambiente (preview ≠ prod) |
| 400 `user_ids…` / `variant…` / `min_version…` | Entrada inválida | Corrigir no painel; a mensagem diz o campo |
| 400 `envio real exige confirm` | Chamada direta sem `confirm: 'ENVIAR'` | Usar o painel ou mandar o campo |
| 500 na simulação | Leitura do `notification_log` ou dos aparelhos falhou | Nada foi enviado; tentar de novo |
| "receberam sem registro no histórico" | O push saiu e a linha do log não foi confirmada | Anotar os uids e **excluí-los** de qualquer coorte futura à mão |
| Ninguém elegível | Versão mínima acima da frota, ou coorte já recebeu | Conferir com a consulta do §3 |

## 9. API (sem o painel)

Bearer = JWT da conta admin.

```bash
# variantes
curl -s "$BASE/api/admin?resource=reactivation&action=variants" -H "Authorization: Bearer $JWT"

# simular
curl -s -X POST "$BASE/api/admin?resource=reactivation" -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"user_ids":["<uid>"],"variant":"C","min_version":"0.35.0","simulate":true}'

# enviar (irreversível)
curl -s -X POST "$BASE/api/admin?resource=reactivation" -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"user_ids":["<uid>"],"variant":"C","min_version":"0.35.0","confirm":"ENVIAR"}'
```

Resposta de envio: `{ data: { mode: 'send', sent: [{user_id, delivered, failed}], skipped: [{user_id, reason}], skipped_by_reason, unlogged: [] } }`.
