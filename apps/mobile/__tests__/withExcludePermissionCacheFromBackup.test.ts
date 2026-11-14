// 120 PO-120-12 — o cache de permissões do expo fica fora do Auto Backup; as regras do
// expo-secure-store continuam (o plugin substitui os XMLs da biblioteca, não pode perdê-las).
// O manifest apontando para estes XMLs foi provado por `expo config --type introspect` (smoke 120).
const { backupRulesXml, extractionRulesXml } = require('../withExcludePermissionCacheFromBackup')

const CACHE = '<exclude domain="sharedpref" path="expo.modules.permissions.asked.xml"/>'
const SECURE = '<exclude domain="sharedpref" path="SecureStore"/>'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('withExcludePermissionCacheFromBackup (120 PO-120-12)', () => {
  it('Android ≤11: exclui o cache de permissões e o SecureStore', () => {
    const xml = backupRulesXml()
    expect(xml).toContain('<full-backup-content>')
    expect(xml).toContain(CACHE)
    expect(xml).toContain(SECURE)
  })

  it('Android 12+: exclui nos dois destinos (nuvem e troca de aparelho)', () => {
    const xml = extractionRulesXml()
    for (const tag of ['cloud-backup', 'device-transfer']) {
      const section = xml.slice(xml.indexOf(`<${tag}>`), xml.indexOf(`</${tag}>`))
      expect(section).toContain(CACHE)
      expect(section).toContain(SECURE)
    }
  })
})
