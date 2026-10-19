import { describe, expect, it, vi } from 'vitest'

describe('English-only interface', () => {
  it('uses English even when the browser requests Italian or a caller requests the legacy locale', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('it-IT')
    try {
      const { default: i18n, initI18n, loadLocale } = await import('./index')
      await initI18n()
      expect(i18n.global.locale.value).toBe('en')
      expect(i18n.global.t('background.abilityScores')).toBe('Ability Score Increases')
      await loadLocale('it')
      expect(i18n.global.availableLocales).toEqual(['en'])
      expect(i18n.global.locale.value).toBe('en')
      expect(i18n.global.t('equipment.tools')).toBe('Tools')
    } finally { vi.restoreAllMocks() }
  })
})
