import texts from './conditions-en.json'
import type { Condition } from './dnd5e/conditions'

function conditions(edition: keyof typeof texts): readonly Condition[] {
  return Object.entries(texts[edition]).map(([id, item]) => ({
    id, ...item, nameIt: item.name, descriptionIt: null,
  }))
}
export const dnd5eConditions = conditions('2014')
export const dnd2024Conditions = conditions('2024')
