import { createI18n } from 'vue-i18n'
import messages from './locales/en.json'

// This fork supports English only, regardless of browser or saved preferences.
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: messages },
})

export async function initI18n(): Promise<void> {
  i18n.global.locale.value = 'en'
}

// Retained for callers using the old locale-loading API.
export async function loadLocale(_locale: string): Promise<void> {
  i18n.global.locale.value = 'en'
}

export default i18n
