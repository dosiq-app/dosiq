#!/usr/bin/env bash
# scripts/stock-forecast-single-source.sh — 072 (FR-005 / PO-072-3): farol de FONTE ÚNICA da
# previsão de estoque.
#
# A 072 criou `deriveStockForecast` (packages/core/src/utils/stockForecast.ts): consumo diário,
# dias restantes, "estoque baixo" e regime num lugar só (INV-1 / ADR-126). Antes, 3 superfícies
# do servidor faziam a conta cada uma do seu jeito e já discordavam no limiar (`< 7` × `<= 7`).
#
# Este gate acusa conta de estoque escrita FORA da canônica:
#   - chamada direta dos primitivos `calculateDailyIntake(`, `calculateDaysRemaining(`,
#     `stockDoseMetrics(` (são internos da canônica — FR-004);
#   - comparação com o limiar `CRITICAL_DAYS`;
#   - nas superfícies de estoque do servidor, o literal `daysRemaining < 7` / `<= 7` / `>= 7`
#     (boundary da PO-072-2: limiar é `STOCK_LOW_DAYS`, nunca o número).
#
# EXCEÇÕES: cada uma é um ARQUIVO nomeado com motivo (boundary da PO-072-3 — nada de diretório
# inteiro). Entrada aqui é para sumir: cada uma aponta a spec que a remove.
#
# LIBERAÇÃO pontual: marcador inline `stock-forecast-gate: ok — <motivo>` na própria linha ou na
# anterior (mesma convenção do vigency-single-source.sh).
set -uo pipefail
cd "$(dirname "$0")/.."

ROOTS=(packages/core/src server api apps/web/src apps/mobile/src)
[[ -n "${STOCK_FORECAST_GATE_EXTRA_ROOT:-}" ]] && ROOTS+=("$STOCK_FORECAST_GATE_EXTRA_ROOT")

PRIMITIVES='(calculateDailyIntake|calculateDaysRemaining|stockDoseMetrics)\(|CRITICAL_DAYS'
LITERAL='daysRemaining *(<|<=|>=|>) *7\b'
LITERAL_SCOPE='^(server/bot/reminders|server/bot/outbox|server/bot/commands|server/utils/formatters\.ts|packages/core/src/chatbot)'

# arquivo | motivo
EXCEPTIONS=(
  "packages/core/src/utils/stockForecast.ts|a canônica"
  "packages/core/src/utils/adherenceLogic.ts|define calculateDailyIntake/calculateDaysRemaining (primitivos)"
  "packages/core/src/utils/stock.ts|define stockDoseMetrics/resolveStockStatus (primitivos)"
  "server/utils/formatters.ts|define o calculateDaysRemaining legado do bot; some com o doseActions"
  "packages/core/src/services/report/reportSections/stock.ts|072 C-6: conceito próprio (soon, piso 0) — relatório 097"
  "apps/mobile/src/features/stock/hooks/_stockDataTransformer.ts|117 Fatia B migra para a canônica"
  "apps/mobile/src/features/stock/screens/StockDetailScreen.tsx|117 Fatia B migra para a canônica"
  "apps/mobile/src/features/stock/components/StockIndicators.tsx|117 Fatia B migra para a canônica"
  "apps/web/src/features/stock/hooks/_stockDataTransformer.ts|web legado congelado (072 D-4)"
  "apps/web/src/features/stock/hooks/useStockData.ts|web legado congelado (072 D-4)"
  "apps/web/src/features/dashboard/hooks/_useDashboardDerived.ts|web legado congelado (072 D-4)"
  "apps/web/src/features/protocols/hooks/_treatmentListUtils.ts|web legado congelado (072 D-4)"
  "server/bot/callbacks/doseActions.ts|DÍVIDA DECLARADA 072: conta própria no recibo de dose (sem líquido/frequência) — decisão do PO pendente"
)

is_exception() {
  local file="$1"
  for entry in "${EXCEPTIONS[@]}"; do
    [[ "$file" == "${entry%%|*}" ]] && return 0
  done
  return 1
}

HITS=$(
  {
    grep -rEn "$PRIMITIVES" "${ROOTS[@]}" --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null
    grep -rEn "$LITERAL" "${ROOTS[@]}" --include='*.ts' --include='*.tsx' --include='*.js' 2>/dev/null \
      | grep -E "$LITERAL_SCOPE"
  } | grep -v __tests__ | grep -v '\.test\.' | sort -u
)

violations=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  file="${line%%:*}"
  rest="${line#*:}"
  lineno="${rest%%:*}"
  code="${rest#*:}"
  # comentário de linha/JSDoc não é conta
  [[ "$code" =~ ^[[:space:]]*(//|\*|/\*) ]] && continue
  is_exception "$file" && continue
  prev=$(sed -n "$((lineno > 1 ? lineno - 1 : 1)),${lineno}p" "$file")
  [[ "$prev" == *"stock-forecast-gate: ok"* ]] && continue
  violations+=("$line")
done <<< "$HITS"

if (( ${#violations[@]} > 0 )); then
  echo "❌ stock-forecast-gate: conta de estoque fora de deriveStockForecast (072 / ADR-126):"
  printf '   %s\n' "${violations[@]}"
  echo ""
  echo "   Use deriveStockForecast (@dosiq/core) e leia dailyIntake/daysRemaining/isCritical/isLow/regime."
  echo "   Limiar: STOCK_LOW_DAYS, nunca o literal. Exceção legítima: marcador 'stock-forecast-gate: ok — <motivo>'."
  exit 1
fi

echo "✅ stock-forecast-gate: previsão de estoque com fonte única (${#EXCEPTIONS[@]} exceções nomeadas)."
exit 0
