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

1. **A dose do dia manda.** O bloco de doses fica sempre no topo e é o foco (único botão cheio) quando
   há dose agora ou dose de hoje sem registro (emenda 125, PO 20/11 — antes só subia com hero). Entre os
   cards, o urgente técnico (lembretes) vem antes do clínico.
2. **Só o mais relevante.** No máximo **1 card de ação** (alerta ou setup, régua única da §2.1). Sem
   agrupamento "+N". **Exceções:** (a) se o 1º é vermelho (sem estoque com dose em 24 h, compra para hoje,
   lembretes desligados), cabe um 2º — um não resolve o outro e um agrava o outro: com o push desligado, o
   próprio aviso de estoque não chegou fora do app; resolvido o estoque, nada avisa na hora da dose;
   (b) wedge sem Agenda de Hoje: até 2 cards abaixo da Semana do tratamento, além do de cima (até 3 no
   total — o widget fecha e fica compacto; PO smoke 125, 20/11).
3. **Nada some em silêncio.** Todo **alerta** tem uma casa permanente; quando não aparece na Hoje
   (suprimido ou dispensado), a casa mostra um **sinal discreto**. **Setup** não tem casa: fora do
   orçamento, espera na fila e entra quando o card da frente se resolve.
4. **O primeiro toque resolve.** O toque no alerta abre o controle que corrige, já com o parâmetro
   (o remédio daquela compra, o ajuste daquele canal) — nunca uma lista onde procurar.
5. **Doses são um bloco.** O bloco mostra o que pede ação; a agenda é a referência do dia.
6. **Promo só sem alerta técnico pendente** (visível ou suprimido pela régua; dispensado não conta), no
   máximo 1, antes da agenda — e só sem card de ação, exceto na vaga livre de baixo do wedge sem Agenda.
7. **O dia é corrigível até fechar.** Dose esquecida pode ser registrada ou pulada até o cron
   noturno fechar o dia.

## 2. Layout

```
Cabeçalho · Adesão                         fixos (Adesão some no perfil wedge e com card de setup)
[ BLOCO DE DOSES ]   sempre no topo: hero, troca de etapa, doses de hoje sem registro (foco da tela)
[ CARDS 1–3 ]        sem estoque c/ dose em 24 h · lembretes desligados · Confira a dose · Confira a forma · Confira o remédio
[ SEMANA DO TRAT. ]  spec 121 · só perfil wedge/misto · posição fixa · fora da régua
[ CARDS 4–7 ]        acabando/próxima compra/bateria otimizada · Falta 1 passo · Confira o tratamento · baixo/OTA
[ PROMO ]            máx 1 · sem técnico pendente · só sem card de ação, ou na vaga livre de baixo (wedge sem Agenda)
Agenda de Hoje       wedge: só quando há dose hoje (§6)
Em breve · Última medida   (Última medida some no wedge)
```

**Orçamento de cards (spec 125 fatia 2 · emenda PO 20/11 · `composeTodayCards`):** o árbitro (§3) escolhe
os **2 melhores alertas** (`alert` + `companion`, o próximo da régua — §3); `pickSetupCard` escolhe o melhor **card de setup** (§2.2). Os dois
concorrem na régua única de 7 degraus (§2.1):

- Aparece **1 card**; **2** só quando o melhor é **urgente** (degrau 1–2). "Urgente" é a classe na régua, não a cor: sem estoque é vermelho; lembretes desligados é âmbar (técnico, cor fixa, sem graduação).
- Degraus 1–3 ficam **acima** da Semana do tratamento; 4–7, **abaixo**.
- **Wedge sem Agenda de Hoje** (sem dose hoje): nada disputa a atenção abaixo do widget ⇒ a faixa de baixo
  aceita até **2** cards de 4–7, além do orçamento de cima. Sobrou vaga ⇒ o promo (se liberado) a ocupa.
- **No máximo 1 card de setup** na tela; vaga que sobra embaixo é de aviso ou promo, nunca de um 2º setup.
- **Alerta** fora do orçamento acende o sinal discreto na casa dele (§4). **Setup** fora do orçamento só
  espera na fila, sem sinal (a aba Tratamentos não o mostra — o ponto apontaria para o vazio; PO 20/11).
- **Só o foco tem botão cheio:** a dose (hero ou sem registro) quando há; senão o 1º card. Os demais, contorno.

**Perfil (spec 121 A, `summarizeWedgeProfile`):** `wedge` = todos os tratamentos ativos GLP-1/
antiobesidade (`WEDGE_CLASS_PREFIXES`); `misto` = algum; `nenhum` = layout acima sem o módulo.
O módulo "Semana do tratamento" é superfície de dose/medida: **não** entra na régua, não cria sinal e
não muda a elegibilidade de nenhum aviso ou promo. No wedge, o vazio "Nenhuma dose hoje" é trocado
pelo módulo; com dose hoje a Agenda fica, porque é o caminho da correção do dia (§6).

### 2.1 Inventário — régua única da Hoje

| Degrau | Card | Origem | Aparece quando | 1º toque | Dispensa | Faixa | Fora do orçamento |
|---|---|---|---|---|---|---|---|
| 1 | **Sem estoque** (urgente · vermelho) | alerta op · 117/120 C | saldo zero **e** dose do remédio em 24 h; ou próxima compra no dia/atrasada | Registrar compra | X · 7 d por remédio e degrau | acima | ponto no Estoque |
| 2 | **Lembretes desligados** (urgente · âmbar fixo) | alerta téc · 120 A | tratamento que gera lembrete + push não utilizável | preparo → diálogo do sistema / Ajustes | "Agora não" · 7 d | acima | ponto no Perfil |
| 3 | **Confira** | setup · 125 | dose do tratamento não fecha com a caixa do catálogo (§2.2) | Conferir / Escolher a caixa / Usar X | **não** — "Aplico X mesmo" vale para a combinação | acima | espera na fila |
| 3 | **Confira a forma** (Corrigir forma) | setup · 125 2a | remédio **com** código cuja forma não está nas formas do seu registro (sidecar 127) ou que o nome contradiz (§2.2) | Corrigir forma | **sim** — "Está certo", por remédio, para sempre | acima | espera na fila |
| 3 | **Confira o remédio** (Vincular) | setup · 125 2a | remédio **sem registro**: sem código, nome/princípio casa com UM item da lista; com código, marca de nome exato **e** forma divergente — aí o vínculo **absorve** o Confira a forma (um card de identidade por remédio; "Não é" devolve a forma) (§2.2, C-2a-16) | Sim, é esse / Não é | **sim** — "Não é", por remédio, para sempre | acima | espera na fila |
| — | *Semana do tratamento* | 121 · wedge/misto | — | — | — | fixa | — |
| 4 | **Acabando** | alerta op · 117 | diário ≤ 3 dias; não diário ≤ 1 dose; ou zero sem dose em 24 h | Registrar compra | X · 7 d | abaixo | ponto no Estoque |
| 4 | **Próxima compra** | alerta op · 105 | data de compra em 0..7 dias (a 1–2 dias âmbar); **início futuro sem estoque para a 1ª dose** (125 FR-034) | Registrar compra | X · 7 d | abaixo | ponto no Estoque |
| 5 | **Falta 1 passo** | setup · 125 | remédio criado ≤ 14 d sem **nenhum** tratamento (pausado conta) | Definir agora | **não** | abaixo | espera na fila |
| 6 | **Confira o tratamento** ("Tratamento cadastrado" até 20/11) | setup · 125 | tratamento ativo criado ≤ 14 d, sem registro de dose, **fora da tela** (não é o do widget nem tem dose na Agenda de hoje) | Sim / Mudar · Ajustar | **não** | abaixo | espera na fila |
| 7 | **Estoque baixo** | alerta op · 072/117 | limiar canônico (`forecast.alertExpected`) — na prática diário 4–7 dias | Registrar compra | X · 7 d | abaixo | ponto no Estoque |
| 3 · 4 · 7 | **Bateria do aparelho** | alerta téc · 068 | regra da 068 (push utilizável). Degrau pelo motivo (PO smoke 125, 20/11): **2º plano restrito = 3** (alarme local e push podem não chegar — acima do widget, sem abrir a 2ª vaga); **"Otimizado" em Xiaomi/Samsung = 4** (atraso); sem motivo = 7 | assistente da 068 | "Não mostrar de novo" | acima (3) · abaixo (4, 7) | ponto no Perfil |
| 7 | **Atualização pronta** | alerta téc · OTA | OTA baixado e app ocioso | reinicia o app | não | abaixo | — (aplica sozinha) |

No mesmo degrau, o árbitro decide entre alertas pela ordem da linha (acabando antes de compra antes de bateria
otimizada; baixo antes de OTA) e, entre remédios, o de menos dias. Alerta e setup no mesmo degrau (3: Confira,
Confira a forma ou Confira o remédio × 2º plano restrito): o alerta vem antes. Só um setup aparece por vez (§2.2),
então os três setups do degrau 3 nunca disputam entre si.

### 2.2 Cards de setup — variações e casos de uso (spec 125 fatia 2)

`pickSetupCard` (core) escolhe **um**: Confira > Confira a forma > Confira o remédio > Falta 1 passo > Confira o
tratamento (fila de 5; forma errada invalida a regra da dose — corrigir antes de conferir dose). Resolvido, o
próximo entra na hora. Fora da espera "1 aviso por sessão". Confira, Confira a forma e Confira o remédio **não têm
janela de 14 d** (miram o cadastro legado). **Sem dispensa** — o toque resolve (PO 17/11, mantido 20/11) — **com
duas exceções (125 2a, PO 19/11 · 22/11):** Confira o remédio ("Não é") e Confira a forma ("Está certo"), que podem
estar errados quando o cadastro está certo; a dispensa é por remédio, no aparelho, e não acende sinal.

**Setup de quem já está na tela (PO 20/11).** "Confira o tratamento" só aparece para tratamento que a Hoje
ainda não mostra. O do widget (Semana do tratamento / Acompanhamento) leva o setup para o **miolo da L1 aberta**:
antes da 1ª dose registrada, no lugar do quadro "Nenhuma aplicação registrada ainda…", "CONFIRA O TRATAMENTO" + "Antes da 1ª aplicação, veja se está como na receita." + linhas rótulo·valor (forma·concentração, Dose, Quando, 1ª aplicação/dose), fundo tingido sem borda e **um CTA só, "Ajustar"** (abre o form em edição) — sem Sim/Mudar, porque a
L1 fechada já tem o "Já apliquei". A 1ª dose registrada resolve: o miolo vira local + histórico. Tratamento com
dose na Agenda de hoje também não ganha o card (a dose já está ali). **Confira não segue essa regra**:
incoerência é aviso e fica como card (degrau 3) mesmo para o tratamento do widget. Vale igual para toda L1 que a
spec 124 levar ao módulo "Acompanhamento".

| Card | Variação | Quando | O card mostra | Ações | O que grava |
|---|---|---|---|---|---|
| Confira o tratamento | diário / quando precisar | ≤ 14 d, sem registro | nome · forma · dose e frequência · "Próxima: …" | Ajustar | nada (abre o form em edição) |
| | não diário, dia/hora não confirmados | idem | "A aplicação é toda terça às 08:00?" (dias alternados/intervalo: "A próxima é …?") | Sim · Mudar | Sim: confirmação no aparelho · Mudar: folha dia + horário → tratamento |
| Falta 1 passo | — | remédio ≤ 14 d sem nenhum tratamento | "{Remédio}: quando tomar?" (injetável: "quando aplicar?") | Definir agora | nada (abre a criação já com o remédio) |
| Confira a dose | dose única (Mounjaro) | dose ≠ concentração × volume de uma aplicação (`lv`) | "**Na caixa:** 2,5 mg por aplicação" · "**No tratamento:** 1 mg por aplicação" | Conferir → folha | ver folha |
| | multidose (Ozempic) | dose fora das doses do mostrador (`dd`) | "**Doses da caneta:** 0,25 · 0,5 · 1 mg" | Conferir → folha (A dose 1º, abre o form; sem rodapé) | ver folha |
| Confira a unidade | injetável em gotas | `intake_unit = gotas` (ou mg × UI trocados) | "**No tratamento:** 2,5 gotas por aplicação" · "Injetável não se mede em gotas. Confira a receita." | Usar 2,5 mg (só se a troca fecha com a caixa) · Ajustar tudo | só a unidade |
| Confira a caixa | concentração fora do registro | conc. salva (valor e unidade) não existe no registro | "**Cadastrado:** 15 mg/mL" · "Essa concentração não está na lista da ANVISA para {Remédio}." | Escolher pelo rótulo | concentração/volume no remédio |
| — | indeterminado | sem registro, sem `lv` nem `dd` (Ozivy), catálogo indisponível ou desalinhado | nenhum card (falha fechada) | — | — |
| Confira a forma | forma fora do registro | remédio com código; forma gravada fora das `f` do registro (sidecar 127) | "A forma cadastrada não bate com {o nome · a lista oficial}. Qual é a certa?" · tabela **Cadastrado:** comprimido / **Pelo nome:**·**Na lista oficial:** líquido (sem forma proposta: "… vem em outra forma.") | É {proposta} · É {cadastrada} (sem proposta: Corrigir forma · Está certo) | nada no card: abre a edição do remédio com a forma proposta marcada; só "Salvar remédio" grava; forma mudou com tratamento ⇒ folha AC7.5 |
| | pista no nome | remédio com código; nome diz gotas/líquido/xarope/solução/suspensão/injetável/cápsula e a forma gravada é outra; genérico sem registro só tem este sinal | "Pelo nome, parece líquido." | idem | idem |
| Confira o remédio | 1 item casa | remédio sem código, nome ou princípio casa com **um** item da base leve (`catalogMatchesFor`); vários casam ⇒ sem card (ruído — C-2a-11, PO 22/11) | "{cadastrado} é o {Nome}?" · "(princípio)" · selo "Base oficial da ANVISA" | Sim, é esse · Não é | a caixa escolhida no passo 2 (identidade + forma + força) no MESMO remédio, depois do antes → depois e do [Usar …]; forma mudou com tratamento ⇒ folha AC7.5 na Hoje |

**Folha "O que precisa ajustar?"** (Confira a dose — texto final do smoke PO 20/11; detalhe na spec 125 AC6.4):
remédio no topo; o fato lado a lado na mesma unidade (NA CAIXA × NO TRATAMENTO); a pergunta ancorada na **receita**
e no **rótulo**; três linhas iguais, título = objeto: **A caixa** (só se a lista tem outra caixa) · **A dose** ·
**Nada, está certo**. Ordem pelo erro provável (caixa maior ⇒ A caixa; multidose ⇒ A dose; senão Nada). Rodapé
"A receita diz outra dose? Editar o tratamento" só na dose única. Passo da caixa: opções **como no rótulo**
("2,5 mg / 0,5 mL"), selo "cadastrado", botão "Usar …". Passo da dose: antes → depois, "Usar 2,5 mg". Toda folha de
setup abre com o remédio (`SetupMedHeader`). O app não propõe dose.

- **Adesão:** some enquanto houver card de setup (nada de "0%" no dia 1).
- **Espera:** o setup só é escolhido com o veredito do catálogo (sidecar 127) pronto ou indisponível, teto 2 s;
  a composição espera também a 1ª carga do estoque — nunca troca de card depois. Snapshot offline ⇒ sem card.
- **Destino dos toques:** "Ajustar"/"Editar o tratamento" abrem o form de tratamento em edição; "Definir agora",
  a criação com o remédio. Gravações usam as mesmas mutações dos forms (cache + alarmes).

Fora do modelo: o aviso de dados em cache/offline (`StaleBanner`, fixo no topo) e a atualização
obrigatória (`app_version_gate`, tela própria).

## 3. Alertas — tipos e régua

| Tipo | Significado | Itens |
|---|---|---|
| **Técnico** | o app não consegue chegar à pessoa — corrige no aparelho | lembretes desligados/bloqueados; bateria do aparelho (OEM); atualização pronta (OTA) |
| **Operacional** | o tratamento no mundo real — corrige na farmácia | sem estoque; estoque acabando; próxima compra; estoque baixo |

O árbitro (`pickTodaySurfaces`) ordena os elegíveis e entrega **dois candidatos**: o 1º (`alert`) e o
próximo da régua (`companion`), com ou sem hero e qualquer que seja o 1º (PO smoke 125, 20/11 — revê a S-23,
que só mandava o 2º atrás de um vermelho; o aviso do Ozivy "acabando" sumia atrás de lembretes desligados).
Os demais ficam suprimidos e acendem a casa. Quem decide se o 2º aparece é a régua da §2.1
(`composeTodayCards`): o que ela não mostra também acende a casa. Na espera da sessão (`quiet`) passam sem
estoque e o que já estava na tela, inclusive como 2º (128 D). Ordem: degrau da §2.1 (`tierOfCandidate`) e, no mesmo degrau, sem estoque ›
lembretes › acabando › próxima compra › baixo › bateria › atualização.

- Na 1ª carga, o espaço do alerta espera o estoque carregar (senão o técnico aparece e é trocado).
- Vários remédios no mesmo **nível de estoque** (sem estoque · acabando · baixo): **um card de grupo** (smoke 125 2a, 22/11) — título com a contagem ("Sem estoque de 2 remédios"), nomes numa linha ("A, B e mais N" a partir de 4) e só a dose mais cedo; o botão abre a aba Estoque (não há um remédio para travar o form). A dispensa vale para o conjunto: volta quando outro remédio entra no grupo. Antes, vencia o de menos dias e os outros ficavam escondidos — dois "Sem estoque" ocupavam os 2 lugares de cima. Compra (105) não agrupa.
- **Nada novo na mesma sessão:** depois que a pessoa resolve ou dispensa um aviso mostrado, nenhum aviso
  **inédito** sobe — sem o próximo da régua e sem promo — até o app voltar do segundo plano. O que **já
  estava na tela** (principal e companheiro) continua: resolveu o principal, o companheiro sobe para o
  lugar principal (128 D — antes sumia junto, regressão da interação S-06 × companheiro fixo do smoke 125).
  Só "sem estoque com dose em 24 h" fura a espera. Os demais seguem com o sinal na casa.
- O promo segue a mesma espera, separada: fechou o upsell ⇒ o nudge só aparece no próximo
  foreground.
- O estoque **escala** com o tempo (baixo → acabando → sem estoque com dose próxima).
- A próxima compra também escala, pela mesma régua da aba Estoque (`purchaseUrgency`): a 1–2 dias
  vira âmbar (degrau 4, como acabando); no dia ou atrasada vira vermelho (degrau 1). O título diz "hoje"/"amanhã".
- A **elegibilidade** de cada alerta continua sendo da sua spec de origem. O árbitro só escolhe
  entre elegíveis — esconder um alerta mudando a regra dele é proibido.

### Moldura e situação

Todos os alertas usam a mesma casca (`PromoCardShell`). Para estoque, ícone, tom **e** texto mudam
com a situação (a cor nunca vem sozinha).

**Só o foco tem fundo colorido** (emenda PO smoke 125, 20/11 — o card âmbar de baixo roubava o olho do
Confira de cima): fora do foco, aviso fica branco com o tom na borda, no ícone e no contorno do botão (neutro mantém o botão
verde — cinza pareceria desabilitado), e o verde de ação fica só no foco; o foco
leva o fundo do tom e o botão cheio. Exceções: erro (sem estoque com dose em 24 h) mantém o fundo sempre; o
Confira no foco ganha fundo âmbar claro. Prop `emphasis` em `PromoCardShell`/`SetupCard`/cards de lembretes e
bateria.

**Forma dos botões** (PO 20/11): todo CTA dos cards da Hoje é retângulo arredondado (`borderRadius.md`), igual
ao "Conferir", "Já apliquei" e "Registrar" do widget. Pílula (`borderRadius.full`) fica só para chips de
seleção (onboarding, forms de remédio e tratamento).


| Situação | Ícone | Tom |
|---|---|---|
| Sem estoque com dose em 24 h | `package-x` | erro |
| Sem estoque, dose depois de 24 h | `package-plus` | aviso — classe **acabando** (degrau 4): "A próxima dose é {quando}. Registre a compra até lá." |
| Acabando | `package-plus` | aviso |
| Próxima compra | `package-plus` | neutro; a 1–2 dias âmbar; no dia vermelho (`package-x`) |

"Próxima compra" é só para quem **zera de propósito** (mensal, etapa seguinte da escada, início futuro —
`supplyNotices`, spec 105/125 FR-034). Remédio contínuo que zerou fora do plano é **sem estoque/acabando**,
nunca neutro, mesmo com a dose a dias: o saldo zero já é o problema.
| Baixo | `package-search` | neutro |

### Dispensa

- Lembretes desligados: "Agora não" adia 7 dias (spec 120 A).
- Alerta operacional: X no canto. Vale por remédio **e** degrau, por 7 dias. Se o degrau sobe
  (baixo → acabando → sem estoque), o alerta volta na hora.
- Bateria: "Não mostrar de novo" (spec 068). Atualização: não dispensável.
- Setup: não dispensável, exceto Confira o remédio ("Não é") e Confira a forma ("Está certo") — §2.2.

## 4. Casas e primeiro toque

| Alerta | Primeiro toque | Casa (recebe o sinal) |
|---|---|---|
| Lembretes desligados | preparo → diálogo do sistema; bloqueado → Ajustes; Android com canal desligado → a tela **do canal** (comum, ou de doses críticas para quem tem alarme crítico) | Perfil › Notificações › engrenagem (Preferências) — o ponto acompanha o caminho até o controle |
| Sem estoque / acabando / baixo | registro de compra **daquele** remédio; grupo ⇒ aba Estoque | aba Estoque |
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
