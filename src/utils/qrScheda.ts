/** QR codes contain only authenticated server character links. */
import type { CharacterData } from '@/stores/character'
import { generateShareUrl } from './shareCharacter'

/** Correzione d'errore, dalla piu' robusta alla piu' capiente. */
export type Correzione = 'M' | 'L'

export interface QrScheda {
  /** Il disegno, pronto da mettere in pagina o da salvare. */
  readonly svg: string
  /** L'indirizzo racchiuso nel codice. */
  readonly url: string
  /** Byte effettivamente codificati. */
  readonly byte: number
  /** Versione QR risultante (1-40): piu' alta = piu' fitto. */
  readonly versione: number
  readonly correzione: Correzione
  /** Vero se per farcelo stare si e' lasciato fuori il testo libero. */
  readonly ridotto: boolean
}

type Fabbrica = typeof import('qrcode-generator')

/** Il modulo del QR e' pesante e serve solo qui: si carica quando serve. */
async function encoder(): Promise<Fabbrica> {
  const mod = await import('qrcode-generator')
  // Il pacchetto e' CommonJS (`export =`): secondo come lo impacchetta il
  // bundler la fabbrica sta sul modulo o sotto `default`. Si accettano
  // entrambi invece di scommettere su uno.
  const conDefault = mod as unknown as { default?: Fabbrica }
  return conDefault.default ?? (mod as unknown as Fabbrica)
}

/**
 * Disegna la matrice come un unico tracciato SVG.
 *
 * Un rettangolo per modulo farebbe migliaia di nodi; un solo `path` con un
 * comando per modulo produce un file molto piu' piccolo.
 *
 * I colori sono fissi, nero su bianco, e non seguono il tema: un QR chiaro su
 * fondo scuro e' invertito, e i lettori che lo accettano sono una minoranza.
 * Qui il codice deve funzionare, non intonarsi — la cornice attorno la mette
 * la pagina. Il margine di 4 moduli e' la zona di quiete che lo standard
 * richiede: senza, molti lettori non agganciano affatto.
 */
function disegnaSvg(scuro: (r: number, c: number) => boolean, moduli: number): string {
  const quiete = 4
  const lato = moduli + quiete * 2
  let d = ''
  for (let r = 0; r < moduli; r++) {
    for (let c = 0; c < moduli; c++) {
      if (scuro(r, c)) d += `M${c + quiete} ${r + quiete}h1v1h-1z`
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}"`,
    ` width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">`,
    `<rect width="${lato}" height="${lato}" fill="#fff"/>`,
    `<path d="${d}" fill="#000"/>`,
    `</svg>`,
  ].join('')
}

/** Prova a costruire un QR per quell'indirizzo, o `null` se non ci sta. */
async function prova(url: string, correzione: Correzione) {
  const qrcode = await encoder()
  try {
    // 0 = lascia scegliere la versione minima che contiene il dato.
    const qr = qrcode(0, correzione)
    qr.addData(url, 'Byte')
    qr.make()
    return qr
  } catch {
    // La libreria solleva quando il dato eccede anche la versione 40.
    return null
  }
}

/** Generate a QR only after the owner has confirmed a server save. */
export async function creaQrScheda(char: CharacterData): Promise<QrScheda> {
  const url = generateShareUrl(char)
  const qr = await prova(url, 'M')
  if (!qr) throw new Error('QR_TOO_LARGE')
  const moduli = qr.getModuleCount()
  return { svg: disegnaSvg((r, c) => qr.isDark(r, c), moduli), url,
    byte: new TextEncoder().encode(url).length, versione: (moduli - 17) / 4,
    correzione: 'M', ridotto: false }
}
