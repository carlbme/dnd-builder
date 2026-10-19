import { describe, it, expect, beforeAll } from 'vitest'
import { dnd5eConditions } from './dnd5e/conditions'
import { dnd2024Conditions } from './dnd2024/conditions'
import { getConditions, getCondition, ensureConditionData, _resetCaches } from './index'
import { dnd5eConditions as english2014, dnd2024Conditions as english2024 } from './conditions-en'
import { GAME_VARIANTS } from '@/stores/app'

/**
 * Le condizioni non c'erano: un privilegio poteva dire «il bersaglio è
 * spaventato» e l'app non sapeva dire cosa volesse dire. Questi test tengono
 * ferme le due cose che si sbagliano per prime nel rimetterci mano: il numero
 * di voci per edizione, e il fatto che dove la fonte tace i dati tacciono.
 */

const IDS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone',
  'restrained', 'stunned', 'unconscious',
]

/** Le quattro che l'Appendice A dell'SRD 5.1 italiano non arriva a tradurre. */
const SENZA_TESTO_2014 = ['frightened', 'prone', 'restrained', 'stunned']

describe('dati delle condizioni', () => {
  for (const [edizione, conditions] of [['2014', dnd5eConditions], ['2024', dnd2024Conditions]] as const) {
    it(`${edizione}: quindici condizioni, gli stessi id in entrambe le edizioni`, () => {
      expect(conditions).toHaveLength(15)
      expect(conditions.map(c => c.id).sort()).toEqual([...IDS].sort())
      expect(new Set(conditions.map(c => c.id)).size).toBe(15)
    })

    it(`${edizione}: ogni voce ha nome inglese e nome italiano`, () => {
      for (const c of conditions) {
        expect(c.name.trim(), c.id).not.toBe('')
        expect(c.nameIt.trim(), c.id).not.toBe('')
        // Un nome italiano identico a quello inglese sarebbe una traduzione
        // mancata travestita da traduzione.
        expect(c.nameIt.toLowerCase(), c.id).not.toBe(c.name.toLowerCase())
      }
    })
  }

  it('2014: senza testo esattamente le quattro assenti dall\'SRD 5.1 italiano', () => {
    const vuote = dnd5eConditions.filter(c => c.descriptionIt === null).map(c => c.id).sort()
    expect(vuote).toEqual(SENZA_TESTO_2014)
    // Le altre undici il testo ce l'hanno davvero, non una stringa vuota.
    for (const c of dnd5eConditions.filter(c => !SENZA_TESTO_2014.includes(c.id))) {
      expect(c.descriptionIt?.length ?? 0, c.id).toBeGreaterThan(40)
    }
  })

  it('2014: le quattro mute non prendono in prestito il testo del 2024', () => {
    for (const id of SENZA_TESTO_2014) {
      const dueMila24 = dnd2024Conditions.find(c => c.id === id)!
      expect(dueMila24.descriptionIt, id).not.toBeNull()
      expect(dnd5eConditions.find(c => c.id === id)!.descriptionIt, id).toBeNull()
    }
  })

  it('2024: tutte hanno il testo', () => {
    for (const c of dnd2024Conditions) {
      expect(c.descriptionIt?.length ?? 0, c.id).toBeGreaterThan(40)
    }
  })

  it('2024: l\'errore di traduzione su «Incapacitato» resta verbatim, con la nota accanto', () => {
    // L'SRD 5.2.1 italiano apre la voce dicendo «paralizzato». È sbagliato, ed
    // è quello che c'è scritto: si cita, non si corregge. L'avvertenza sta in
    // `note`, che l'interfaccia tiene staccata dal testo della fonte.
    const inc = dnd2024Conditions.find(c => c.id === 'incapacitated')!
    expect(inc.descriptionIt).toContain('"paralizzato"')
    expect(inc.note).toBeTruthy()
    expect(inc.note).toMatch(/errore di traduzione/i)
    expect(inc.descriptionIt).not.toContain(inc.note!)
  })

  it('nessuna nota redazionale finisce dentro il testo della fonte', () => {
    for (const c of [...dnd5eConditions, ...dnd2024Conditions]) {
      if (!c.note) continue
      expect(c.descriptionIt ?? '', c.id).not.toContain(c.note)
    }
  })
})

describe('English condition loading by variant', () => {
  beforeAll(async () => {
    _resetCaches()
    for (const variant of GAME_VARIANTS) await ensureConditionData(variant)
  })
  it('uses the correct English rules edition for each variant', () => {
    expect(getConditions('dnd2024')).toEqual(english2024)
    for (const variant of ['dnd5e', 'brancalonia', 'apocalisse'] as const) {
      expect(getConditions(variant)).toEqual(english2014)
      expect(getConditions(variant).every(c => c.description && c.description.length > 40)).toBe(true)
    }
  })
  it('retains separate rules for matching condition IDs', () => {
    expect(getCondition('dnd5e', 'exhaustion')!.description).not.toBe(getCondition('dnd2024', 'exhaustion')!.description)
  })
  it('looks up English names and IDs', () => {
    expect(getCondition('dnd5e', 'prone')?.name).toBe('Prone')
    expect(getCondition('dnd2024', 'Frightened')?.id).toBe('frightened')
    expect(getCondition('dnd5e', 'unknown')).toBeUndefined()
  })
  it('returns empty lists until loaded', () => {
    _resetCaches()
    expect(getConditions('dnd5e')).toEqual([])
    expect(getConditions('dnd2024')).toEqual([])
  })
})
