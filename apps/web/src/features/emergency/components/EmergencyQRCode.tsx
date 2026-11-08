/**
 * @fileoverview QR Code do Cartão de Emergência (spec 074).
 *
 * O QR é um artefato de PAPEL (D1). Conteúdo = link `https://dosiq.app/er#<texto>` (D5): a câmera
 * nativa só abre tipos que reconhece, e o texto legível vai no fragmento (nunca chega a servidor).
 * Texto e link vêm do montador único do core (`buildEmergencyQrText`) — este componente só desenha. O download é um PNG CR80 (1024×1632) com QR + faixa de texto (D4).
 *
 * @module features/emergency/components/EmergencyQRCode
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import QRCode from 'qrcode'
import { TriangleAlert, ScanQrCode, ImageDown, Share } from 'lucide-react'
import { buildEmergencyQrText } from '@dosiq/core'
import { getSaoPauloTime, getTodayLocal, formatLocalDate, parseISO } from '@utils/dateUtils'
import {
  layoutEmergencyPng,
  emergencyPngFileName,
  type MeasureText,
} from '@features/emergency/utils/emergencyPngLayout'
import './EmergencyQRCode.css'

/** Renderiza estado de carregamento do QR code. */
function QRLoadingState() {
  return (
    <div className="emergency-qr-code loading">
      <div className="qr-loading-spinner"></div>
      <p>Gerando QR code...</p>
    </div>
  )
}

/** Renderiza estado de erro do QR code. */
function QRErrorState({ error, onRetry }) {
  return (
    <div className="emergency-qr-code error">
      <div className="qr-error-icon"><TriangleAlert size={32} /></div>
      <p>{error}</p>
      <button className="btn-emergency-outline" onClick={onRetry}>
        Tentar Novamente
      </button>
    </div>
  )
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const TITLE_RED = '#B91C1C'

/** Formata o 1º contato para a faixa do PNG (pt-BR, com acento). */
function formatContact(contact): string | null {
  if (!contact?.phone && !contact?.name) return null
  const who = [contact.name, contact.relationship ? `(${contact.relationship})` : null].filter(Boolean).join(' ')
  return [who, contact.phone].filter(Boolean).join(' ')
}

/**
 * Desenha o PNG CR80 do cartão. P&B-seguro: QR preto puro, vermelho só no título (G-7).
 * @returns data URL `image/png`
 */
async function renderEmergencyPng(qrUrl: string, fields): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')
  const measure: MeasureText = (text, px, bold) => {
    ctx.font = `${bold ? 'bold ' : ''}${px}px ${FONT_STACK}`
    return ctx.measureText(text).width
  }
  const layout = layoutEmergencyPng(fields, measure)
  canvas.width = layout.width
  canvas.height = layout.height
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, layout.width, layout.height)

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, qrUrl, {
    width: layout.qr.size,
    margin: layout.qr.margin,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qrCanvas, layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  for (const line of layout.lines) {
    ctx.font = `${line.bold ? 'bold ' : ''}${line.fontPx}px ${FONT_STACK}`
    ctx.fillStyle = line.color === 'title' ? TITLE_RED : '#000000'
    ctx.fillText(line.text, layout.width / 2, line.y)
  }
  return canvas.toDataURL('image/png')
}

/**
 * QR de emergência: miniatura na tela + download/compartilhamento do PNG CR80.
 *
 * @param props.cardData - cartão (`blood_type`, `allergies`, `emergency_contacts`)
 * @param props.medications - medicamentos vigentes, na ordem da tela
 * @param props.name - `display_name` do perfil; ausente ⇒ omitido (FR-013)
 * @param props.lastUpdated - ISO da última atualização do cartão
 */
export default function EmergencyQRCode({
  cardData,
  medications,
  name,
  lastUpdated,
}: {
  cardData: any
  medications: any
  name?: string | null
  lastUpdated?: any
}) {
  // ===== STATES (R-010: Hook Order) =====
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState(null)
  const [isGenerating, setIsGenerating] = useState(true)

  // ===== MEMOS (R-010: Hook Order) =====

  /** Conteúdo do QR — montador único do core (FR-005), texto legível (FR-001). */
  const qr = useMemo(() => {
    if (!cardData) return null
    // Dia de SP do instante — corte do ISO daria o dia UTC (21h–00h viraria o dia seguinte, AP-342)
    const updatedOn = lastUpdated
      ? formatLocalDate(getSaoPauloTime(parseISO(lastUpdated)))
      : getTodayLocal()
    return buildEmergencyQrText({
      name,
      bloodType: cardData.blood_type,
      allergies: cardData.allergies,
      contacts: cardData.emergency_contacts,
      medications: medications || [],
      updatedOn,
    })
  }, [cardData, medications, name, lastUpdated])

  const qrText = qr?.text || ''
  const qrUrl = qr?.url || ''

  const pngFields = useMemo(() => {
    if (!cardData) return null
    return {
      name,
      bloodType: cardData.blood_type && cardData.blood_type !== 'desconhecido' ? cardData.blood_type : null,
      allergies: cardData.allergies || [],
      contact: formatContact(cardData.emergency_contacts?.[0]),
    }
  }, [cardData, name])

  const fileName = useMemo(() => emergencyPngFileName(name), [name])

  // ===== EFFECTS (R-010: Hook Order) =====

  /** Gera a miniatura de tela quando o texto muda. */
  useEffect(() => {
    if (!qrUrl) {
      // Use timeout para evitar setState síncrono no effect
      const timeoutId = setTimeout(() => setIsGenerating(false), 0)
      return () => clearTimeout(timeoutId)
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsGenerating(true)
    setError(null)

    const generateQR = async () => {
      try {
        const dataUrl = await QRCode.toDataURL(qrUrl, {
          width: 256,
          margin: 4,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'M',
          type: 'image/png',
        })
        setQrDataUrl(dataUrl)
        setIsGenerating(false)
      } catch (err) {
        console.error('[EmergencyQRCode] Erro ao gerar QR:', err)
        setError('Não foi possível gerar o QR code. Tente novamente.')
        setIsGenerating(false)
      }
    }

    generateQR()
  }, [qrUrl])

  // ===== HANDLERS (R-010: Hook Order) =====

  /** Baixa o PNG CR80 (QR + faixa de texto) — D4. */
  const handleDownload = useCallback(async () => {
    if (!qrUrl || !pngFields) return
    try {
      const pngUrl = await renderEmergencyPng(qrUrl, pngFields)
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('[EmergencyQRCode] Erro ao baixar:', err)
      setError('Não foi possível baixar a imagem. Tente novamente.')
    }
  }, [qrUrl, pngFields, fileName])

  /** Compartilha o mesmo PNG CR80 (Web Share); fallback para download. */
  const handleShare = useCallback(async () => {
    if (!qrUrl || !pngFields) return
    try {
      const pngUrl = await renderEmergencyPng(qrUrl, pngFields)
      const blob = await (await fetch(pngUrl)).blob()
      const file = new File([blob], fileName, { type: 'image/png' })
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Cartão de Emergência',
          text: 'Meu cartão de emergência médica',
          files: [file],
        })
      } else {
        await handleDownload()
      }
    } catch (err) {
      // Ignora erro de cancelamento pelo usuário
      if (err?.name !== 'AbortError') {
        console.error('[EmergencyQRCode] Erro ao compartilhar:', err)
        await handleDownload()
      }
    }
  }, [qrUrl, pngFields, fileName, handleDownload])

  // ===== RENDER =====

  if (isGenerating) return <QRLoadingState />
  if (error) return <QRErrorState error={error} onRetry={() => setError(null)} />

  if (!qrDataUrl) {
    return (
      <div className="emergency-qr-code empty">
        <p>Dados insuficientes para gerar QR code.</p>
      </div>
    )
  }

  return (
    <div className="emergency-qr-code">
      <div className="qr-code-container">
        <img src={qrDataUrl} alt={qrText} className="qr-code-image" width={256} height={256} />
        <p className="qr-hint">
          <ScanQrCode size={16} /> Aponte a câmera do celular — abre alergias, medicamentos e contato
        </p>
        {qr && qr.droppedMedications > 0 && (
          <p className="qr-cut-warning">
            O QR mostra {qr.totalMedications - qr.droppedMedications} dos {qr.totalMedications} tratamentos — a
            lista completa está impressa no cartão.
          </p>
        )}
      </div>

      <div className="qr-actions">
        <button className="btn-emergency" onClick={handleDownload}>
          <ImageDown size={16} /> Salvar Imagem
        </button>
        <button className="btn-emergency-outline" onClick={handleShare}>
          <Share size={16} /> Compartilhar
        </button>
      </div>

      <div className="qr-info">
        <p className="qr-info-text">
          <strong>Dica:</strong> Imprima a imagem no tamanho de um cartão e guarde junto do documento.
        </p>
        <p className="qr-info-text">
          Para aparecer sem desbloquear o celular, preencha a Ficha Médica (iPhone) ou as Informações
          de emergência (Android).
        </p>
      </div>
    </div>
  )
}
