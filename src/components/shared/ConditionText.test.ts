import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ConditionText from './ConditionText.vue'
import { ensureConditionData } from '@/data'
import messages from '@/i18n/locales/en.json'

function mountText(text: string, variant: 'dnd5e' | 'dnd2024' | 'brancalonia' = 'dnd5e') {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
  return mount(ConditionText, { props: { text, variant }, global: { plugins: [i18n] } })
}

beforeAll(async () => {
  for (const variant of ['dnd5e', 'dnd2024', 'brancalonia'] as const) await ensureConditionData(variant)
})

describe('English condition explanations', () => {
  it('keeps ordinary text intact and makes English conditions accessible buttons', () => {
    const w = mountText('The target is Charmed until your next turn.')
    expect(w.text()).toBe('The target is Charmed until your next turn.')
    expect(w.findAll('button')).toHaveLength(1)
    expect(w.find('button').text()).toBe('Charmed')
    expect(w.find('button').attributes('aria-expanded')).toBe('false')
  })
  it('does not add buttons to unrelated text', () => {
    expect(mountText('You gain an inspiration die.').findAll('button')).toHaveLength(0)
  })
  it('opens and closes English SRD text', async () => {
    const w = mountText('The target is Charmed.')
    await w.find('button').trigger('click')
    expect(w.find('[role="note"]').text()).toContain('A charmed creature can’t attack the charmer')
    expect(w.find('button').attributes('aria-expanded')).toBe('true')
    await w.find('button').trigger('click')
    expect(w.find('[role="note"]').exists()).toBe(false)
  })
  it.each(['dnd5e', 'dnd2024', 'brancalonia'] as const)('%s supplies English text for formerly untranslated conditions', async variant => {
    for (const name of ['Frightened', 'Prone', 'Restrained', 'Stunned']) {
      const w = mountText(`The target is ${name}.`, variant)
      await w.find('button').trigger('click')
      expect(w.find('[role="note"]').text()).not.toContain(messages.conditions.noText)
      expect(w.find('[role="note"]').text()).not.toMatch(/creatura|personaggio|italian/i)
    }
  })
  it('preserves edition-specific exhaustion rules', async () => {
    const old = mountText('You gain Exhaustion.', 'dnd5e')
    const revised = mountText('You gain Exhaustion.', 'dnd2024')
    await old.find('button').trigger('click')
    await revised.find('button').trigger('click')
    expect(old.find('[role="note"]').text()).toContain('Speed halved')
    expect(revised.find('[role="note"]').text()).toContain('2 times your Exhaustion level')
    expect(revised.find('[role="note"]').text()).not.toContain('Speed halved')
  })
})
