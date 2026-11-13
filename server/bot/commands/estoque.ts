import { supabase } from '../../services/supabase.js';
import { getUserIdByChatId } from '../../services/userService.js';
import { formatStockStatus } from '../../utils/formatters.js';
import { deriveStockForecast, isProtocolVigentOn, getTodayLocal } from '@dosiq/core';
import { replyIfStockDisabled } from '../services/stockTrackingGuard.js';

export async function handleEstoque(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const userId = await getUserIdByChatId(chatId);

    // Dose-only (spec 044): convite de ativação em vez de saldo vazio / "estoque 0".
    if (await replyIfStockDisabled(bot, chatId, userId)) return;

    // Get all medicines with their stock and active protocols
    const { data: medicines, error: medError } = await supabase
      .from('medicines')
      .select(`
        *,
        stock(*),
        protocols!protocols_medicine_id_fkey(*)
      `)
      .eq('user_id', userId)
      .is('archived_at', null) // 094: medicamento excluído (arquivado) não é estoque vivo
      .order('name');

    if (medError) throw medError;

    if (!medicines || medicines.length === 0) {
      return await bot.sendMessage(chatId, 'Você não possui medicamentos cadastrados\\.');
    }

    // Uma única data de referência para o comando inteiro (evita duas datas se o
    // comando cruzar a meia-noite no meio do laço).
    const today = getTodayLocal();

    let message = '📦 *Estoque de Medicamentos:*\n\n';
    let hasLowStock = false;
    let hasMedicinesToShow = false;

    for (const medicine of medicines) {
      // 064: vigência (active + start/end_date). Tratamento encerrado não conta consumo
      // nem mantém o medicamento listado no /estoque.
      const activeProtocols = (medicine.protocols || []).filter(p => isProtocolVigentOn(p, today));

      // Only show medicines with active protocols
      if (activeProtocols.length === 0) {
        continue;
      }

      hasMedicinesToShow = true;

      // Assuming each entry in stock represents a number of pills
      const totalQuantity = (medicine.stock || []).reduce((sum, s) => sum + s.quantity, 0);


      // 072 (ADR-126): consumo, dias e "estoque baixo" vêm da previsão canônica do core. Sem
      // `titration_steps` aqui (D-3) ⇒ steps=[] ⇒ só a regra do esparso decide o regime (INV-4).
      // O aviso segue o critério de antes (dias inteiros <= 7, saldo zero incluso), sem olhar o
      // regime: o /estoque é consulta, não alarme.
      const forecast = deriveStockForecast({
        medicineId: medicine.id,
        medicine,
        protocols: activeProtocols,
        quantity: totalQuantity,
        steps: [],
        asOf: today,
      });
      // A previsão carrega `dosesRemaining` + `isDaily` — o formato dose-primário (ADR-067).
      message += formatStockStatus(medicine, totalQuantity, forecast.daysRemaining, forecast) + '\n';

      if (forecast.isCritical) {
        hasLowStock = true;
      }
    }

    if (!hasMedicinesToShow) {
      return await bot.sendMessage(chatId, 'Não há medicamentos com protocolos ativos para exibir no estoque\\.');
    }

    if (hasLowStock) {
      message += '\n⚠️ *Atenção:* Alguns medicamentos estão com estoque baixo\\!';
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
  } catch (err) {
    console.error('Erro ao buscar estoque:', err);
    await bot.sendMessage(chatId, 'Erro ao buscar estoque\\.');
  }
}
