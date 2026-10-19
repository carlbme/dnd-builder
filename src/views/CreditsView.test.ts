import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import messages from '@/i18n/locales/en.json'
import CreditsView from './CreditsView.vue'

function page() {
  return mount(CreditsView, { global: {
    plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: messages } })],
    stubs: { RouterLink: { template: '<a><slot /></a>' } },
  } })
}

describe('English credits', () => {
  it('preserves SRD attribution and license URLs', () => {
    const text = page().text()
    for (const credit of ['SRD 5.1', 'SRD 5.2.1', 'Wizards of the Coast LLC', 'creativecommons.org/licenses/by/4.0']) expect(text).toContain(credit)
  })
  it('preserves the setting creators and distinguishes their works', () => {
    const text = page().text()
    expect(text).toContain('Brancalonia is a roleplaying game by Acheron Games')
    expect(text).toContain('Zappa e Spada was created by Mauro Longo, Davide Mana, and Samuel Marolla')
    expect(text).toContain('Jack Sensolini and Luca Mazza')
    expect(text).toContain('Riccardo Sirignano and Simone Formicola')
  })
  it('uses English notices and links to the source details', () => {
    const w = page()
    for (const quote of w.findAll('blockquote')) expect(quote.attributes('lang')).toBe('en')
    const links = w.findAll('a').map(a => a.attributes('href'))
    expect(links).toContain('https://www.acheron.it')
    expect(links).toContain('https://github.com/carlbme/dnd-builder/blob/main/DATA-SOURCES.md')
  })
})
