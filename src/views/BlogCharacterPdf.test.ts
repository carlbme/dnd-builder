import { describe, it, expect, beforeAll } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { blogCharacters } from '@/data/blog/characters'
import { englishPdfFields } from '@/utils/englishPdf'
import { preloadVariantData } from '@/data'
import { GAME_VARIANTS } from '@/stores/app'
import messages from '@/i18n/locales/en.json'

beforeAll(async () => {
  setActivePinia(createPinia())
  for (const variant of GAME_VARIANTS) await preloadVariantData(variant)
})

describe('English sample character exports', () => {
  it.each(blogCharacters.filter(b => b.variant === 'brancalonia').map(b => [b.slug, b] as const))('%s uses the same English prose on screen and in exports', (slug, sample) => {
    const entries = messages.blog.characters as unknown as Record<string, Record<string, string>>
    for (const key of ['personalityTraits', 'ideals', 'bonds', 'flaws'] as const) {
      expect(sample.characterData[key]).toBe(entries[slug]![key])
      expect(Object.values(englishPdfFields(sample.characterData))).toContain(sample.characterData[key])
    }
    expect(sample.characterData.backstory).toBe(entries[slug]!.bio)
    expect(sample.characterData.misdeeds).not.toMatch(/^Ha /)
    expect(sample.characterData.brawlingMoves.join(', ')).not.toMatch(/Pugno|Schiaffo|Presa|Testata/)
  })
})
