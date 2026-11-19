---
title: "Publicação da Base ANVISA/CMED (Storage + banco)"
description: "Como publicar a base ANVISA/CMED com `npm run cmed:publish`: o que o script faz, requisitos, guardas, arquivos do manifest e rollback."
version: "2.0.0"
status: active
category: operation
audience:
  - ops
  - dev
tags:
  - supabase
  - anvisa
  - cmed
  - database
created_at: "2026-07-08"
updated_at: "2026-11-19"
---

# Guia — Publicação da Base ANVISA/CMED

> **Desde a spec 119 (2026-11-15) a publicação é um comando só: `npm run cmed:publish`.** Ele sobe
> os arquivos do manifest para o bucket **e** carrega no banco o catálogo derivado
> (`cmed_class_keys`) usado pelo painel admin. Não suba arquivo à mão pelo dashboard: o banco
> ficaria numa versão e o bucket em outra (ADR-123, CON-045).

---

## 1. O que é publicado

### Arquivos (bucket público `dosiq-assets`, pasta `anvisa/v1/`)

| Arquivo | Conteúdo | Quem consome | Guarda no script |
|---|---|---|---|
| `manifest.json` | versão, `generatedAt`, `path`/`size`/`count` de cada arquivo | web + mobile (invalida cache por versão/TTL 7d) | sobe **por último** |
| `medicineDatabase.json` | base ANVISA (passo 1 da busca), array | web + mobile | tamanho e count = manifest |
| `laboratoryDatabase.json` | laboratórios, array | web + mobile | tamanho e count = manifest |
| `cmedIndex.json` | índice CMED colunar v1 (~26 mil apresentações; passo 2) | mobile (`useCmedIndex`) | tamanho = manifest; `decodeCmedIndex` do core aceita; linhas = count |
| `cmedStrengths.json` | sidecar de forças **1:1 com `medicineDatabase`** (spec 127, v1) | mobile (vínculo/setup, 125 2a) | ver §4 |

URLs públicas: `https://<project_ref>.supabase.co/storage/v1/object/public/dosiq-assets/anvisa/v1/<arquivo>`.

> ⚠️ Bucket público = leitura anônima de **tudo** dentro dele. Nunca coloque arquivo sensível ali.

### Banco (só servidor)

`public.cmed_class_keys (token → class_codes[], catalog_version)` — palavra normalizada das chaves de
produto e substância do `cmedIndex` → códigos de classe. É o que a RPC do painel usa para achar o
"provável GLP-1 pelo nome" (spec 119). Tabela fechada (só `service_role`), troca atômica pela RPC
`admin_load_cmed_class_keys`. O app **não** lê a tabela; continua no JSON (funciona offline).

---

## 2. Origem dos arquivos

- Os arquivos vivem em **`~/git/dosiq-moat/data/anvisa/`** (repo privado) — é o diretório padrão do
  script (`--dir` troca).
- São gerados pelo pipeline de dados `clean-anvisa-med-db` (`cmed/run.py`), que também escreve o
  `manifest.json` com `size`/`count` reais e faz o bump de versão (`--bump minor` quando entra
  arquivo novo, `--bump patch` nas atualizações mensais). **Nunca edite o manifest à mão**: o script
  confere cada número contra o arquivo e aborta se divergir.
- Fonte bruta: dados abertos da ANVISA (`https://dados.anvisa.gov.br/dados/`) e a tabela CMED.

---

## 3. Como publicar

### Requisitos

| Item | Detalhe |
|---|---|
| Node + deps do monorepo | `npm install` na raiz; o script roda via `tsx` (importa o core TS) |
| Arquivos | `manifest.json` + todos os arquivos que ele lista, no `--dir` |
| QA (padrão) | `.env.local` da raiz → URL do `dosiq-qa` (`ikcvwxyohmntncanclze`) + `SUPABASE_SERVICE_ROLE_KEY` (ou `VITE_SUPABASE_SERVICE_KEY`) |
| Prod | `.env` da raiz → URL de prod (`kwqjtdsqkkbebfiaxubb`) + `SUPABASE_SERVICE_ROLE_KEY` |
| Banco | migração `20261115_119_cmed_class_keys.sql` aplicada no projeto-alvo (senão a carga falha depois do upload) |

Variáveis lidas, em ordem: `CMED_SUPABASE_URL`/`CMED_SUPABASE_SERVICE_KEY` › `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` › `VITE_SUPABASE_URL`/`VITE_SUPABASE_SERVICE_KEY`.
🔴 A chave `service_role` nunca vem de arquivo versionado e nunca é impressa (mensagens de erro passam por redação).

### Comandos

```bash
cd ~/git/dosiq

# 1. Ensaio: valida tudo e mostra o alvo, sem escrever nada
npm run cmed:publish -- --dry-run

# 2. QA primeiro (CON-044)
npm run cmed:publish

# 3. Prod — pede para DIGITAR o project_ref de prod antes de escrever
npm run cmed:publish -- --prod
```

Opções: `--dir <pasta>` (padrão `../dosiq-moat/data/anvisa`) · `--dry-run` · `--prod`. Qualquer outra opção aborta.

Saída esperada (exemplo, base 1.3.0 no QA):

```
cmed:publish → qa (ikcvwxyohmntncanclze) · versão 1.3.0 · 26642 linhas CMED → 6777 tokens
  ✓ dosiq-assets/anvisa/v1/medicineDatabase.json
  ✓ dosiq-assets/anvisa/v1/laboratoryDatabase.json
  ✓ dosiq-assets/anvisa/v1/cmedIndex.json
  ✓ dosiq-assets/anvisa/v1/cmedStrengths.json
  ✓ dosiq-assets/anvisa/v1/manifest.json
  ✓ cmed_class_keys = 6777 tokens · versão 1.3.0
```

### O que o script faz, na ordem

1. **Valida os arquivos** (antes de qualquer rede): manifest legível com `version` e `files.cmedIndex`;
   para cada arquivo listado — caminho dentro de `anvisa/v1/`, tamanho em bytes = `size`, JSON válido
   e a guarda do tipo (tabela da §1). Formato que o script não conhece **não sobe**.
2. **Resolve o alvo e confere a chave:** o `project_ref` da URL tem de ser QA ou prod (outro ⇒ aborta).
   URL de prod sem `--prod` ⇒ aborta; `--prod` com URL de QA ⇒ aborta. Chave JWT de outro projeto,
   ou que não seja `service_role` ⇒ aborta. Com `--prod`, pede o project_ref digitado.
3. **Monta o derivado** `palavra → classes` com `buildClassTokenMap` (core).
4. **Sobe os arquivos** com `upsert`, **manifest por último** — o app só enxerga a versão nova
   depois que todos os dados já estão no bucket.
5. **Carrega o catálogo** numa transação (`admin_load_cmed_class_keys`): valida versão, contagem e
   formato dos códigos, troca tudo e confere o inserido. Falha ⇒ rollback, catálogo anterior intacto.

### Se a carga do banco falhar (passo 5)

O bucket **já** está na versão nova e o banco segue na anterior — o script diz isso e sai com código
≠ 0. Corrija a causa e **rode de novo**: o comando é idempotente. O rodapé do painel admin mostra a
versão do catálogo no banco ("catálogo CMED x.y.z"); ela tem de bater com o manifest.

---

## 4. `cmedStrengths.json` (spec 127)

O sidecar é **posicional**: a entrada `items[i]` descreve o item `i` do `medicineDatabase.json`. Um
sidecar de outra versão ou de outro tamanho desalinha as forças em silêncio, então o script exige:

- `v === 1` (formato conhecido);
- `version` do sidecar = `manifest.version`;
- `medCount` = `items.length` = `count` do manifest;
- `count` do sidecar = `count` do `medicineDatabase` no mesmo manifest (G34).

Orçamento (G36, gate do pipeline): `< 150 KB` gzip e `< 650 KB` bruto — base 1.3.0: 485 KB bruto, 89 KB gzip.
App que ainda não lê o sidecar simplesmente o ignora; publicar antes do consumidor é seguro.

---

## 5. Validação depois de publicar

```bash
# Leitura anônima (deve dar 200 e a versão nova)
curl -s https://<project_ref>.supabase.co/storage/v1/object/public/dosiq-assets/anvisa/v1/manifest.json | head -c 200
```

```sql
-- Catálogo no banco (MCP execute_sql, só leitura)
select count(*), max(catalog_version), count(distinct catalog_version) from public.cmed_class_keys;
-- esperado: count = tokens do log, max = manifest.version, 1 versão
```

No app: busca ANVISA no cadastro com 3+ caracteres traz resultados; o cache local revalida pelo
manifest (TTL 7 dias).

---

## 6. Rollback

- **Versão errada publicada:** volte os arquivos da versão anterior para o `--dir` (histórico do
  `dosiq-moat`, `git checkout <commit> -- data/anvisa`) e rode o `cmed:publish` de novo — bucket e
  banco voltam juntos.
- **App cacheou versão errada:** o manifest com `version` nova força o re-download; em último caso,
  bump de `ANVISA_VERSION` no mobile (`useMedicineDatabase.ts`) invalida o cache no próximo build.
- **Mudança de formato incompatível** (ex.: `cmedIndex` v2): exige pasta nova (`anvisa/v2/`) e
  consumidor atualizado antes — o script recusa `v` desconhecido.

---

## 7. Setup único (só se o bucket não existir — projeto novo)

1. Supabase → Storage → **New bucket**: nome `dosiq-assets`, **Public** ✅, sem limite de MIME.
2. Não é preciso criar pastas: o upload do script cria `anvisa/v1/`.
3. Aplicar a migração `docs/migrations/20261115_119_cmed_class_keys.sql` (QA antes de prod).
4. (Opcional) Cache CDN: `manifest.json` curto (≤ 1 h); demais arquivos mais longos — a invalidação
   é pelo manifest, não pelo path.

---

## 8. Checklist de uma publicação

- [ ] Pipeline gerou arquivos + manifest com versão nova em `dosiq-moat/data/anvisa/` (commit no moat)
- [ ] `npm run cmed:publish -- --dry-run` passa
- [ ] `npm run cmed:publish` (QA) ⇒ todos os ✓ e `cmed_class_keys = N tokens · versão X`
- [ ] Smoke no app de QA (busca ANVISA + passo 2)
- [ ] `npm run cmed:publish -- --prod` ⇒ mesmos números
- [ ] Rodapé do painel admin mostra a versão nova
