// withExcludePermissionCacheFromBackup.js — config plugin (spec 120, C-01 higiene / PO-120-12)
//
// O expo-modules guarda em sharedprefs (`expo.modules.permissions.asked.xml`) que já pediu uma
// permissão. Com o Auto Backup do Android esse arquivo volta num restore (reinstalação, troca de
// aparelho) e o `canAskAgain` do Expo nasce FALSO sem a pessoa ter negado nada — o onboarding e o
// alarme crítico (`ensurePushPermission`) mandavam aos Ajustes algo que um "Permitir" resolvia.
//
// Os XMLs de backup do expo-secure-store vêm da BIBLIOTECA (android/src/main/res/xml/), não do
// prebuild — não dá para editá-los. Então este plugin escreve XMLs próprios = regras do
// secure-store + a exclusão do cache, e aponta o manifest para eles. Registrado DEPOIS do
// `expo-secure-store` em app.config.js: o plugin dele, ao ver atributos que não são os seus, só
// avisa no console e não sobrescreve (`withSecureStore.js`: `canApply… false ⇒ console.warn`).
//
// RE-001: app.config.js é o formato canônico; registrado em `plugins`.

const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins')

const PERMISSION_CACHE = 'expo.modules.permissions.asked.xml'
const BACKUP_RULES = 'dosiq_backup_rules'
const EXTRACTION_RULES = 'dosiq_data_extraction_rules'

// Regras do expo-secure-store (SecureStore fora do backup) + o cache de permissões fora.
const EXCLUDES = [
  '<exclude domain="sharedpref" path="SecureStore"/>',
  `<exclude domain="sharedpref" path="${PERMISSION_CACHE}"/>`,
]

function backupRulesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Auto Backup, Android 11 e anteriores (spec 120 — gerado por withExcludePermissionCacheFromBackup) -->',
    '<full-backup-content>',
    '  <include domain="sharedpref" path="."/>',
    ...EXCLUDES.map((e) => `  ${e}`),
    '</full-backup-content>',
    '',
  ].join('\n')
}

function extractionRulesXml() {
  const section = (tag) => [`  <${tag}>`, '    <include domain="sharedpref" path="."/>', ...EXCLUDES.map((e) => `    ${e}`), `  </${tag}>`]
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Auto Backup, Android 12+ (spec 120 — gerado por withExcludePermissionCacheFromBackup) -->',
    '<data-extraction-rules>',
    ...section('cloud-backup'),
    ...section('device-transfer'),
    '</data-extraction-rules>',
    '',
  ].join('\n')
}

function withBackupRuleFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRulesXml())
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), extractionRulesXml())
      return cfg
    },
  ])
}

function withBackupRuleManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app.$['android:fullBackupContent'] = `@xml/${BACKUP_RULES}`
    app.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RULES}`
    return cfg
  })
}

module.exports = function withExcludePermissionCacheFromBackup(config) {
  return withBackupRuleManifest(withBackupRuleFiles(config))
}
module.exports.backupRulesXml = backupRulesXml
module.exports.extractionRulesXml = extractionRulesXml
