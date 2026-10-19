import { PDFDocument, PDFTextField, PDFCheckBox, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fontUrl from '@/assets/fonts/atkinson-hyperlegible-400.ttf?url'
import type { CharacterData } from '@/stores/character'
import { ensureSpellData, preloadVariantData, getSpells, getClasses } from '@/data'
import { getDnd5eFieldMapping } from './pdfFieldMapping'
import { apocalisseRules } from '@/data/apocalisse/rules'
import { translateGameTerm } from '@/i18n/gameTerms'

const SKILLS = ['ACRO', 'ANIM', 'ARC', 'ATH', 'DEC', 'HIST', 'INS', 'INTI', 'INV', 'MED', 'NAT', 'PERC', 'PERF', 'PERS', 'REL', 'SLE', 'STLTH', 'SURV']
const NAMES = ['Acrobatics', 'Animal', 'Arcana', 'Athletics', 'Deception ', 'History ', 'Insight', 'Intimidation', 'Investigation ', 'Medicine', 'Nature', 'Perception ', 'Performance', 'Persuasion', 'Religion', 'SleightofHand', 'Stealth ', 'Survival']
const ALIASES: Record<string, string> = {
  DEXmod: 'DEXmod ', CHAmod: 'CHamod', 'Feats+Traits': 'Feat+Traits',
  STRprof: 'Check Box 11', DEXprof: 'Check Box 18', CONprof: 'Check Box 19',
  INTprof: 'Check Box 20', WISprof: 'Check Box 21', CHAprof: 'Check Box 22',
}
SKILLS.forEach((key, i) => {
  ALIASES[key] = NAMES[i]!
  ALIASES[`${key}P`] = `Check Box ${23 + i}`
})

/** Adapt the legacy IDs to the official English form, whose names include spaces. */
export function englishPdfFields(char: CharacterData): Record<string, string | boolean> {
  const original = getDnd5eFieldMapping(char, 'en', true)
  const fields: Record<string, string | boolean> = {}
  for (const [key, value] of Object.entries(original)) {
    if (/^Wpn(?: Name [45]|[45] )/.test(key) || key === 'Spells 101014') continue
    fields[ALIASES[key] ?? key] = value
  }
  // The Italian form had an additional row at the top of level 1. Reflow it.
  const levelOne = ['Spells 101014', 'Spells 1015', ...Array.from({ length: 11 }, (_, i) => `Spells ${1023 + i}`)]
  const names = levelOne.map(key => original[key]).filter((v): v is string => typeof v === 'string')
  levelOne.slice(1).forEach((key, i) => { fields[key] = names[i] ?? '' })
  fields['CharacterName 2'] = char.name
  fields.Speed = `${char.speed} ft.`
  return fields
}

/** Paginated supplement keeps long notes, extra weapons/spells, and variant data readable. */
async function addSupplement(doc: PDFDocument, char: CharacterData, fields: Record<string, string | boolean>, font: PDFFont) {
  let page = doc.addPage([612, 792])
  let y = 738
  const newPage = () => { page = doc.addPage([612, 792]); y = 738 }
  const line = (text: string, size = 10) => {
    if (y < 48) newPage()
    page.drawText(text, { x: 42, y, size, font, color: rgb(0.1, 0.1, 0.1) })
    y -= size + 5
  }
  const paragraph = (heading: string, text: string) => {
    if (!text) return
    if (y < 90) newPage()
    y -= 10
    line(heading, 12)
    // Wrap by measured width, including long tokens, without truncating notes.
    for (const source of text.replace(/\r\n?/g, '\n').split('\n')) {
      let row = ''
      for (const word of source.trim().split(/\s+/)) {
        const candidate = row ? `${row} ${word}` : word
        if (font.widthOfTextAtSize(candidate, 10) <= 528) {
          row = candidate
          continue
        }
        if (row) { line(row); row = '' }
        // Split a token only when it cannot fit on an otherwise empty line.
        for (const ch of word) {
          if (font.widthOfTextAtSize(row + ch, 10) > 528) { line(row); row = '' }
          row += ch
        }
      }
      line(row.trimEnd())
    }
  }
  line(`${char.name || 'Character'} - Additional details`, 16)
  line(`Rules: ${ { dnd5e: 'D&D 5e (2014)', dnd2024: 'D&D 2024', brancalonia: 'Brancalonia', apocalisse: 'Apocalisse' }[char.variant] }`)
  const classes = getClasses(char.variant)
  const subclassName = (classId: string, id: string) => classes.find(c => c.id === classId)?.subclasses.find(s => s.id === id)?.name ?? id.replace(/-/g, ' ')
  const subclass = char.classes.length >= 2
    ? char.classes.filter(c => c.subclass).map(c => subclassName(c.classId, c.subclass)).join(', ')
    : char.subclass ? subclassName(char.className, char.subclass) : ''
  paragraph('Class and subclass', [String(fields.ClassLevel), subclass].filter(Boolean).join(' - '))
  paragraph('Features and traits', String(fields['Features and Traits'] || ''))
  paragraph('Weapons', char.weapons.map(w => `${w.name}${w.magicBonus ? ` +${w.magicBonus}` : ''}: attack ${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus}, damage ${w.damage}`).join('\n'))
  paragraph('Equipment', String(fields.Equipment || ''))
  paragraph('Proficiencies and languages', String(fields.ProficienciesLang || ''))
  const labels = { personalityTraits: 'Personality traits', ideals: 'Ideals', bonds: 'Bonds', flaws: 'Flaws', backstory: 'Backstory', allies: 'Allies and organizations', treasure: 'Treasure', sessionNotes: 'Session notes' } as const
  for (const [key, label] of Object.entries(labels)) paragraph(label, char[key as keyof typeof labels])
  if (char.variant === 'brancalonia') {
    paragraph('Brawling moves', char.brawlingMoves.map(m => translateGameTerm(m, 'en', 'trait')).join(', '))
    paragraph('Brawling condition', `Whacks level: ${char.whacksLevel}`)
    paragraph('Misdeeds', char.misdeeds)
  }
  if (char.variant === 'apocalisse') {
    const mark = apocalisseRules.marks.find(m => m.id === char.mark)
    const spirit = mark?.spirits.find(s => s.id === char.markSpirit)
    paragraph('Spirit', spirit?.name ?? char.markSpirit)
    const die = apocalisseRules.markDiceProgression.find(d => char.level >= d.levelRange[0] && char.level <= d.levelRange[1])
    paragraph('Mark die', die?.die ?? '')
  }
  if (char.variant === 'brancalonia') {
    paragraph('Currency', `Copper: ${char.coins.cp}, Silver: ${char.coins.sp}, Iron: ${char.coins.ep}, Gold: ${char.coins.gp}, Platinum: ${char.coins.pp}`)
  }
  const spells = getSpells(char.variant)
  const allIds = [...new Set([...char.cantrips, ...char.spellsKnown, ...char.spellsPrepared])]
  paragraph('Spells', allIds.map(id => {
    const spell = spells.find(s => s.id === id || s.name.toLowerCase() === id.toLowerCase())
    const name = spell?.name ?? id.replace(/^\d+-/, '').replace(/-/g, ' ')
    const level = spell?.level ?? Number(/^(\d+)-/.exec(id)?.[1] ?? 0)
    return `${level === 0 ? 'Cantrip' : `Level ${level}`}: ${name}${char.spellsPrepared.includes(id) ? ' (prepared)' : ''}`
  }).join('\n'))
}

export async function createEnglishPdf(char: CharacterData): Promise<Uint8Array> {

  await preloadVariantData(char.variant)
  await ensureSpellData(char.variant)
  const response = await fetch(`${import.meta.env.BASE_URL}pdf/character-sheet-en.pdf`)
  if (!response.ok) throw new Error(`Unable to load English PDF template (${response.status})`)

  const doc = await PDFDocument.load(await response.arrayBuffer())
  doc.registerFontkit(fontkit)
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) throw new Error('Unable to load PDF font')

  const font = await doc.embedFont(await fontResponse.arrayBuffer(), { subset: true })
  const form = doc.getForm()

  const mapping = englishPdfFields(char)

  for (const [name, value] of Object.entries(mapping)) {
    const field = form.getField(name) // A missing field is an export error, never silently discarded.
    if (field instanceof PDFCheckBox && typeof value === 'boolean') {
      if (value) field.check()
    } else if (field instanceof PDFTextField && typeof value === 'string') {
      field.acroField.setDefaultAppearance(`/${font.name} 0 Tf 0 g`)
      field.setText(value)
    }
  }

  for (const field of form.getFields()) {

    if (field instanceof PDFTextField) {
      field.acroField.setDefaultAppearance(`/${font.name} 0 Tf 0 g`)
      const fullText = field.getText() ?? ''
      // Keep the editable value complete, but bound the painted preview. Long
      // paragraphs are printed in full on the paginated additional pages.
      if (fullText.length > 300) field.setText(fullText.slice(0, 250) + '\n[Full text: additional details]')
      field.updateAppearances(font)
      if (fullText.length > 300) field.setText(fullText)
    }
  }
  for (const field of form.getFields()) {
    if (field instanceof PDFCheckBox) field.updateAppearances()
  }

  await addSupplement(doc, char, mapping, font)
  doc.setLanguage('en-US')
  doc.setTitle(`${char.name || 'Character'} - Character sheet`)

  return doc.save({ updateFieldAppearances: false })
}
