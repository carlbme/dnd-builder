import { describe, it, expect, beforeAll, vi } from 'vitest'
import { preloadVariantData } from '@/data'
import { generateRandomCharacter } from '@/utils/randomCharacter'
import {
  encodeCharacterCompressed, decodeCharacterAny, encodeCharacterToUrl,
  MARCATORE_COMPRESSO, sappiamoComprimere,
} from '@/utils/shareCharacter'
import { creaQrScheda } from '@/utils/qrScheda'

const cloud = vi.hoisted(() => ({ drafts: new Proxy({}, { get: () => ({ serverId: '11111111-1111-4111-8111-111111111111', dirty: false }) }) }))
vi.mock('@/stores/cloud', () => ({ useCloudStore: () => cloud }))

const VARIANTI = ['dnd5e', 'dnd2024', 'brancalonia', 'apocalisse'] as const

beforeAll(async () => {
  for (const v of VARIANTI) await preloadVariantData(v)
})

describe('formato compresso', () => {
  it('l\'ambiente sa comprimere', () => {
    expect(sappiamoComprimere()).toBe(true)
  })

  it.each(VARIANTI)('%s: andata e ritorno senza perdite', async (v) => {
    const c = generateRandomCharacter(v)
    const tornato = await decodeCharacterAny(await encodeCharacterCompressed(c))
    // Ogni campo che il formato lungo conserva, lo conserva anche il compresso.
    const lungo = await decodeCharacterAny(encodeCharacterToUrl(c))
    expect(tornato).toEqual(lungo)
  })

  it('comprime davvero: meno della meta\' del formato lungo', async () => {
    const c = generateRandomCharacter('dnd5e')
    const lungo = encodeCharacterToUrl(c).length
    const corto = (await encodeCharacterCompressed(c)).length
    expect(corto).toBeLessThan(lungo / 2)
  })

  it('i link del formato vecchio continuano a leggersi', async () => {
    const c = generateRandomCharacter('brancalonia')
    const vecchio = encodeCharacterToUrl(c)
    expect(vecchio.startsWith(MARCATORE_COMPRESSO)).toBe(false)
    const tornato = await decodeCharacterAny(vecchio)
    expect(tornato.name).toBe(c.name)
    expect(tornato.race).toBe(c.race)
  })

  it('omettendo i testi sparisce il racconto e non il resto', async () => {
    const c = generateRandomCharacter('dnd5e')
    c.backstory = 'lungo racconto'
    c.sessionNotes = 'note'
    const intero = await decodeCharacterAny(await encodeCharacterCompressed(c, false))
    const ridotto = await decodeCharacterAny(await encodeCharacterCompressed(c, true))
    expect(intero.backstory).toBe('lungo racconto')
    expect(ridotto.backstory).toBeUndefined()
    expect(ridotto.sessionNotes).toBeUndefined()
    expect(ridotto.personalityTraits).toBeUndefined()
    // Quel che non e' testo libero resta.
    expect(ridotto.name).toBe(c.name)
    expect(ridotto.className).toBe(c.className)
    expect(ridotto.abilityScores).toEqual(intero.abilityScores)
    expect(ridotto.spellsKnown).toEqual(intero.spellsKnown)
  })
})

/** Legge la matrice dal tracciato SVG: ogni modulo scuro e' un `M<col> <riga>`. */
function moduliDaSvg(svg: string): { lato: number; scuro: (r: number, c: number) => boolean } {
  const vb = /viewBox="0 0 (\d+) \1"/.exec(svg)
  if (!vb) throw new Error('viewBox assente')
  const lato = Number(vb[1])
  const quiete = 4
  const insieme = new Set<string>()
  for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    insieme.add(`${Number(m[2]) - quiete},${Number(m[1]) - quiete}`)
  }
  return { lato: lato - quiete * 2, scuro: (r, c) => insieme.has(`${r},${c}`) }
}

/** Il quadrato di ricerca: anello scuro, anello chiaro, cuore 3x3 scuro. */
function haQuadratoDiRicerca(scuro: (r: number, c: number) => boolean, r0: number, c0: number): boolean {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const bordo = r === 0 || r === 6 || c === 0 || c === 6
      const cuore = r >= 2 && r <= 4 && c >= 2 && c <= 4
      if (scuro(r0 + r, c0 + c) !== (bordo || cuore)) return false
    }
  }
  return true
}

describe('il QR della scheda', () => {
  it.each(VARIANTI)('%s: si costruisce ed e\' ben formato', async (v) => {
    const qr = await creaQrScheda(generateRandomCharacter(v))
    expect(qr.versione).toBeGreaterThanOrEqual(1)
    expect(qr.versione).toBeLessThanOrEqual(40)
    expect(Number.isInteger(qr.versione)).toBe(true)
    expect(qr.url).toContain('/character/11111111-1111-4111-8111-111111111111')
    expect(qr.byte).toBeLessThanOrEqual(2953)
    expect(qr.svg.startsWith('<svg')).toBe(true)
    expect(qr.svg.endsWith('</svg>')).toBe(true)

    const { lato, scuro } = moduliDaSvg(qr.svg)
    // Il lato di un QR e' 17 + 4 x versione: e' la prova che versione e
    // disegno raccontano la stessa cosa.
    expect(lato).toBe(17 + 4 * qr.versione)
    // I tre quadrati di ricerca, senza i quali nessun lettore aggancia.
    expect(haQuadratoDiRicerca(scuro, 0, 0)).toBe(true)
    expect(haQuadratoDiRicerca(scuro, 0, lato - 7)).toBe(true)
    expect(haQuadratoDiRicerca(scuro, lato - 7, 0)).toBe(true)
    // La riga di sincronismo: moduli alternati fra i due quadrati in alto.
    for (let c = 8; c < lato - 8; c++) expect(scuro(6, c)).toBe(c % 2 === 0)
  })

  it('the QR contains only an authenticated server link, never character JSON', async () => {
    const c = generateRandomCharacter('dnd2024')
    c.name = 'PrivateNameNotInTheLink'
    const qr = await creaQrScheda(c)
    expect(qr.url).not.toContain(c.name)
    expect(qr.url).not.toContain('/share/')
    expect(qr.url).toMatch(/\/character\/[a-f0-9-]+$/)
  })

  it('un personaggio normale ci sta intero, senza sacrifici', async () => {
    const qr = await creaQrScheda(generateRandomCharacter('dnd5e'))
    expect(qr.ridotto).toBe(false)
  })

  it('large private notes do not change the link or truncate character data', async () => {
    const c = generateRandomCharacter('dnd5e')
    const initial = await creaQrScheda(c)
    c.backstory = 'private notes'.repeat(10000)
    const next = await creaQrScheda(c)
    expect(next.url).toBe(initial.url)
    expect(next.ridotto).toBe(false)
    expect(c.backstory.length).toBe(130000)
  })
})
