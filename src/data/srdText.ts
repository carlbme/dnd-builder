import { getTraitDescription } from './index'
import type { GameVariant } from '@/stores/app'

export type TestoSrd =
  | { stato: 'presente', testo: string }
  | { stato: 'soloInglese', testo: string }
  | { stato: 'assente' }

function englishText(text: string): TestoSrd {
  return text.trim() ? { stato: 'presente', testo: text.trim() } : { stato: 'assente' }
}

export function slugPrivilegioBackground(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function testoPrivilegio(
  _variant: GameVariant, _featureId: string, _locale: string, text: string,
): TestoSrd {
  return englishText(text)
}

export function testoTratto(variant: GameVariant, traitId: string, _locale: string): TestoSrd {
  return englishText(getTraitDescription(variant, traitId, 'en'))
}

export function testoPrivilegioBackground(
  _variant: GameVariant, _featureName: string, _locale: string,
  text: string, englishFeatText = '',
): TestoSrd {
  return englishText(text || englishFeatText)
}
