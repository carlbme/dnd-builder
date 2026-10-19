/// <reference types="node" />
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs'
import { createEnglishPdf, englishPdfFields } from './englishPdf'
import { blogCharacters } from '@/data/blog/characters'
import { preloadVariantData } from '@/data'
import { GAME_VARIANTS } from '@/stores/app'

beforeAll(async () => {
  setActivePinia(createPinia())
  for (const variant of GAME_VARIANTS) await preloadVariantData(variant)
})

describe('English PDF exports', () => {
  it.each(GAME_VARIANTS)('%s uses only fields present in the English template', async variant => {
    const doc = await PDFDocument.load(new Uint8Array(fs.readFileSync('public/pdf/character-sheet-en.pdf')))
    const names = new Set(doc.getForm().getFields().map(f => f.getName()))
    for (const sample of blogCharacters.filter(b => b.variant === variant)) {
      const char = structuredClone(sample.characterData)
      char.weapons = Array.from({ length: 6 }, (_, i) => ({ name: `Weapon ${i}`, attackBonus: 5, damage: '1d8' }))
      char.skillProficiencies = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival']
      char.savingThrowProficiencies = ['str', 'dex', 'con', 'int', 'wis', 'cha']
      const fields = englishPdfFields(char)
      expect(Object.keys(fields).filter(name => !names.has(name))).toEqual([])
      expect(fields['CharacterName']).toBe(char.name)
      expect(fields['Speed']).toBe(`${char.speed} ft.`)
      expect(String(fields['Features and Traits'])).not.toMatch(/Talento:|Rissa -|Marchio:|Virtù:|Peccato:|Umanità:/)
    }
  })

  it.each(GAME_VARIANTS)('%s creates a readable PDF with full supplemental notes', async variant => {
    const char = structuredClone(blogCharacters.find(b => b.variant === variant)!.characterData)
    char.name = 'English export café'
    char.backstory = 'A long personal history with no missing ending. '.repeat(80) + 'THE LAST LINE'
    char.sessionNotes = 'Player notes stay as entered: città.'
    char.weapons.push({ name: 'Extra weapon', attackBonus: 9, damage: '2d6' })
    const before = JSON.stringify(char)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = url.includes('.pdf') ? 'public/pdf/character-sheet-en.pdf' : 'src/assets/fonts/atkinson-hyperlegible-400.ttf'
      const bytes = new Uint8Array(fs.readFileSync(path))
      return { ok: true, arrayBuffer: async () => bytes.buffer }
    }))
    try {
      const bytes = await createEnglishPdf(char)
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(5)
      expect(doc.getForm().getTextField('CharacterName').getText()).toBe(char.name)
      expect(doc.getForm().getTextField('Backstory').getText()).toBe(char.backstory)
      expect(JSON.stringify(char)).toBe(before)
      // Retain inspectable artifacts for PDF text extraction and visual acceptance checks.
      fs.mkdirSync('.work/english-only', { recursive: true })
      fs.writeFileSync(`.work/english-only/${variant}-export.pdf`, bytes)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
