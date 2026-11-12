// withOkHttpPing.js — config plugin (spec 084 Slice B, C-B4)
//
// Smoke 2026-11-12: depois do aparelho dormir, TODA requisição do app ficava presa ~1 min (antes do
// teto JS de 15 s: para sempre). O fetch do RN no Android é OkHttp com timeouts 0 (infinito) e as
// chamadas ao Supabase multiplexam numa conexão HTTP/2. Conexão morta em silêncio (NAT/Wi-Fi no
// sono) não é detectada: as novas requisições entram nela e esperam. O ping HTTP/2 a cada 10 s
// derruba a conexão morta em segundos e o OkHttp abre outra.
//
// Instala uma OkHttpClientFactory no MainApplication.onCreate, ANTES do loadReactNative (o
// NetworkingModule lê a fábrica ao criar o client). Parte do builder padrão do RN (cookie jar,
// demais configs), só acrescenta o ping. Nativo ⇒ build de loja (R-314).

const { withMainApplication } = require('@expo/config-plugins')

const PING_SECONDS = 10
const MARKER = '// dosiq: OkHttp ping (084 C-B4)'
const IMPORTS = [
  'import com.facebook.react.modules.network.OkHttpClientFactory',
  'import com.facebook.react.modules.network.OkHttpClientProvider',
  'import java.util.concurrent.TimeUnit',
]
const FACTORY = [
  `    ${MARKER}`,
  '    OkHttpClientProvider.setOkHttpClientFactory(OkHttpClientFactory {',
  `      OkHttpClientProvider.createClientBuilder().pingInterval(${PING_SECONDS}L, TimeUnit.SECONDS).build()`,
  '    })',
].join('\n')

function applyOkHttpPing(src) {
  if (src.includes(MARKER)) return src
  let out = src
  for (const imp of IMPORTS) {
    if (!out.includes(imp)) out = out.replace(/^(package [^\n]+\n)/m, `$1\n${imp}`)
  }
  const anchor = /(override fun onCreate\(\) \{\n\s*super\.onCreate\(\)\n)/
  if (!anchor.test(out)) throw new Error('[withOkHttpPing] onCreate/super.onCreate() não encontrado no MainApplication')
  return out.replace(anchor, `$1${FACTORY}\n`)
}

function withOkHttpPing(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error('[withOkHttpPing] MainApplication em Kotlin esperado')
    cfg.modResults.contents = applyOkHttpPing(cfg.modResults.contents)
    return cfg
  })
}

module.exports = withOkHttpPing
module.exports.applyOkHttpPing = applyOkHttpPing
module.exports.PING_SECONDS = PING_SECONDS
