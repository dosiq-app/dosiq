---
title: "Superfícies da aba Hoje"
description: "Modelo de prioridade da aba Hoje no app mobile: árbitro único, régua de alertas, bloco de doses, promo, sinal discreto nas casas permanentes e correção do dia (registrar/pular tardio)."
version: "1.0.0"
status: active
category: architecture
audience:
  - dev
  - product
tags:
  - mobile
  - hoje
  - alertas
  - doses
---

# Superfícies da aba Hoje

A aba Hoje é a tela inicial do app mobile. Várias partes do produto querem aparecer nela (aviso de
lembretes desligados, estoque, próxima compra, bateria do aparelho, atualização, banners, doses).
Sem uma regra que limite o total, elas se empilham e empurram as doses para fora da primeira tela.

Este documento descreve a regra. A implementação mora em
`apps/mobile/src/features/dashboard/utils/pickTodaySurfaces.ts` (o **árbitro**) e é coberta por
teste de tabela (`utils/__tests__/pickTodaySurfaces.test.ts`). Decisão: ADR-129 (spec 120, fatia C).

## 1. Princípios

1. **Técnico antes do clínico.** Se o app não consegue chegar à pessoa, todo o resto fica
   comprometido. **Exceção:** dose acontecendo agora — a pessoa está no app por causa dela.
2. **Só o mais relevante.** No máximo **1 alerta** visível. Sem agrupamento "+N". **Exceção:** sem
   dose agora, se o 1º é vermelho (sem estoque com dose em 24 h / compra para hoje), um alerta técnico
   pendente (lembretes ou bateria) aparece logo abaixo. Um não resolve o outro e um agrava o outro:
   com o push desligado, o próprio aviso de estoque não chegou fora do app; resolvido o estoque, nada
   avisa na hora da dose.
3. **Nada some em silêncio.** Todo alerta tem uma casa permanente; quando não aparece na Hoje
   (suprimido pela régua ou dispensado), a casa mostra um **sinal discreto**.
4. **O primeiro toque resolve.** O toque no alerta abre o controle que corrige, já com o parâmetro
   (o remédio daquela compra, o ajuste daquele canal) — nunca uma lista onde procurar.
5. **Doses são um bloco.** O bloco mostra o que pede ação; a agenda é a referência do dia.
6. **Promo só sem alerta técnico pendente** (visível ou suprimido pela régua; dispensado não conta),
   no máximo 1, entre o bloco de doses e a agenda.
7. **O dia é corrigível até fechar.** Dose esquecida pode ser registrada ou pulada até o cron
   noturno fechar o dia.

## 2. Layout

```
Cabeçalho · Adesão                         fixos
[ BLOCO DE DOSES ]   ← sobe acima do alerta SÓ quando há dose agora (hero)
[ ALERTA ]           máx 1 · régua §3
[ BLOCO DE DOSES ]   posição normal
[ PROMO ]            máx 1 · só sem alerta técnico pendente
Agenda de Hoje
Em breve · Última medida
```

Fora do modelo: o aviso de dados em cache/offline (`StaleBanner`, fixo no topo) e a atualização
obrigatória (`app_version_gate`, tela própria).

## 3. Alertas — tipos e régua

| Tipo | Significado | Itens |
|---|---|---|
| **Técnico** | o app não consegue chegar à pessoa — corrige no aparelho | lembretes desligados/bloqueados; bateria do aparelho (OEM); atualização pronta (OTA) |
| **Operacional** | o tratamento no mundo real — corrige na farmácia | sem estoque; estoque acabando; próxima compra; estoque baixo |

Régua: o primeiro elegível vence; os demais ficam suprimidos.

| # | Alerta | Tipo | Elegível quando |
|---|---|---|---|
| 1 | Sem estoque | op | saldo zero **e** dose do remédio nas próximas 24 h |
| 2 | Lembretes desligados | téc | tratamento que gera lembrete + push não utilizável (spec 120 A) |
| 3 | Estoque acabando | op | diário ≤ 3 dias; não diário ≤ 1 dose (`isUrgent` da previsão canônica); ou zero sem dose em 24 h |
| 4 | Próxima compra | op | data de compra em 0..7 dias (spec 105) |
| 5 | Estoque baixo | op | limiar canônico (`forecast.alertExpected`, spec 072/117) — na prática diário 4–7 dias |
| 6 | Bateria do aparelho | téc | regra da spec 068 (push utilizável) |
| 7 | Atualização pronta | téc | OTA baixado e app ocioso; não dispensável |

- Na 1ª carga, o espaço do alerta espera o estoque carregar (senão o técnico aparece e é trocado).
- Vários remédios no mesmo degrau: vence o de menos dias; os outros ficam na casa.
- **Um aviso por sessão:** depois que a pessoa resolve ou dispensa o aviso mostrado, o espaço
  fica vazio — sem o próximo da régua e sem promo — até o app voltar do segundo plano. Só "sem
  estoque com dose em 24 h" fura a espera. Os demais seguem com o sinal na casa.
- O promo segue a mesma espera, separada: fechou o upsell ⇒ o nudge só aparece no próximo
  foreground.
- O estoque **escala** com o tempo (baixo → acabando → sem estoque com dose próxima).
- A próxima compra também escala, pela mesma régua da aba Estoque (`purchaseUrgency`): a 1–2 dias
  vira âmbar (degrau 3); no dia ou atrasada vira vermelho (degrau 1). O título diz "hoje"/"amanhã".
- A **elegibilidade** de cada alerta continua sendo da sua spec de origem. O árbitro só escolhe
  entre elegíveis — esconder um alerta mudando a regra dele é proibido.

### Moldura e situação

Todos os alertas usam a mesma casca (`PromoCardShell`). Para estoque, ícone, tom **e** texto mudam
com a situação (a cor nunca vem sozinha):

| Situação | Ícone | Tom |
|---|---|---|
| Sem estoque com dose em 24 h | `package-x` | erro |
| Acabando | `package-plus` | aviso |
| Próxima compra | `package-plus` | neutro; a 1–2 dias âmbar; no dia vermelho (`package-x`) |
| Baixo | `package-search` | neutro |

### Dispensa

- Lembretes desligados: "Agora não" adia 7 dias (spec 120 A).
- Alerta operacional: X no canto. Vale por remédio **e** degrau, por 7 dias. Se o degrau sobe
  (baixo → acabando → sem estoque), o alerta volta na hora.
- Bateria: "Não mostrar de novo" (spec 068). Atualização: não dispensável.

## 4. Casas e primeiro toque

| Alerta | Primeiro toque | Casa (recebe o sinal) |
|---|---|---|
| Lembretes desligados | preparo → diálogo do sistema; bloqueado → Ajustes; Android com canal desligado → a tela **do canal** (comum, ou de doses críticas para quem tem alarme crítico) | Perfil › Notificações › engrenagem (Preferências) — o ponto acompanha o caminho até o controle |
| Sem estoque / acabando / baixo | registro de compra **daquele** remédio | aba Estoque |
| Próxima compra | registro de compra do remédio da próxima etapa | aba Estoque |
| Bateria do aparelho | assistente da spec 068 | Perfil › Alarme e bateria (e a aba Perfil) |
| Atualização pronta | reinicia o app | — (aplica sozinha no próximo início) |

**Sinal discreto:** ponto de 8 dp na cor de aviso, sem número, sem animação. Aparece enquanto o
alerta existir e não estiver visível na Hoje; some quando o alerta deixa de existir. Abrir a casa
não apaga o sinal. Leitor de tela: "Estoque, novo aviso".

## 5. Bloco de doses e agenda

Bloco, em ordem:

1. **Dose agora (hero)** — inclui as pendentes de dias anteriores ainda no prazo. Elas não se
   repetem em outra seção.
2. **Troca de etapa** (titulação).
3. **Doses de hoje sem registro** — só sem hero. Resumo: total, horários e [Ver na agenda] (rola e
   abre o turno da 1ª sem registro). Sem ações no card — a agenda é o único ponto de ação.

Ações na agenda, pelo estado da dose de hoje:

| Estado | Ações |
|---|---|
| Na janela | [Tomar] [Pular] |
| Fora da janela, sem registro (até o cron) | [Registrar] [Pular] — estado neutro, não "perdida" |
| Perdida (`missed`, dia fechado) | nenhuma |
| Pulada | sai da agenda — é um registro; correção pelo histórico de doses |

## 6. Correção do dia (registrar e pular tardio)

- **Registrar tardio:** abre o registro em lote com o `instanceId` de cada dose e a hora inicial =
  **horário previsto** (editável). Com `instanceId`, o registro ancora na ocorrência de forma
  estrita: a ocorrência vira `taken`; nunca nasce dose avulsa. Ver `DOSE_ACTIONS.md` e
  `DOSE_INSTANCES.md`.
- **Pular tardio:** `skip_dose_atomic` com o instante declarado = **horário previsto** da dose (a
  decisão é registrada "no horário", não no clique). As proteções da spec 067 continuam no banco:
  instante futuro recusado, piso da janela. Uma chamada por horário (o pulo em lote é
  tudo-ou-nada).
- **Até o fim do dia:** o limite é da interface. O cron noturno marca as pendentes como `missed` e
  a agenda deixa de oferecer ação. Nenhuma outra superfície (histórico, bot) oferece pulo
  retroativo.
- **Adesão:** dose pulada sai do denominador; pular é neutro.

## 7. Medição

- `today_surface_shown` — 1× por foco: alerta mostrado, promo, tipos suprimidos. Responde se algum
  alerta passa semanas suprimido.
- `dose_logged` e `dose_skipped` com `late: true` no registro e no pulo tardios.
- Detalhe e PII: `docs/standards/TRACKING_PLAN.md`.

## 8. Regra de manutenção

**Superfície nova na Hoje entra no árbitro e neste documento no mesmo PR.** Ela declara tipo
(técnico, operacional, promo ou dose), posição na régua, casa permanente e primeiro toque. Lógica
de prioridade fora do árbitro (no JSX da tela, em outro hook) é regressão.

## Referências

- `NUDGE_BANNERS.md` — banners remotos (sempre promo, nunca alerta).
- `DOSE_ACTIONS.md` — registrar, pular, desfazer.
- `DOSE_INSTANCES.md` — ocorrências, tolerância, cron que fecha o dia.
- `MOBILE_NOTIFICATIONS.md` — lembretes, permissão, canais.
