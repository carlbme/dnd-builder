import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { setActivePinia, createPinia } from 'pinia'
import { h } from 'vue'
import App from './App.vue'
import en from './i18n/locales/en.json'

const i18n = createI18n({
  legacy: false, locale: 'en', fallbackLocale: 'en',
  messages: { en: { ...en, gdpr: { label: 'Cookies', banner: 'No cookies here', accept: 'OK' } } },
  missingWarn: false, fallbackWarn: false,
})

const RouterLinkStub = { props: ['to'], render() { return h('a') } }

// jsdom qui espone un localStorage senza removeItem/clear: per il consenso
// serve una memoria vera, e riparte pulita a ogni prova.
function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
}

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
}

async function mountApp() {
  const wrapper = mount(App, {
    global: {
      plugins: [i18n],
      stubs: { AppHeader: true, RouterLink: RouterLinkStub, RouterView: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('cornice dell\'app', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubMatchMedia()
    stubLocalStorage()
  })

  it('identifies the fork and preserves upstream attribution without donation or EU branding', async () => {
    const wrapper = await mountApp()
    const footer = wrapper.find('footer')
    expect(footer.text()).toContain('Blocker Bunch D&D Builder')
    expect(footer.text()).toContain('Based on')
    expect(footer.find('a[href="https://www.brainstormclub.it/"]').text()).toBe('Brainstorm Club’s Character Builder')
    expect(footer.find('a[href="https://github.com/carlbme/dnd-builder"]').text()).toBe('Source')
    expect(footer.find('a[href="https://github.com/Brainstorm-Club/dnd-character-builder"]').text()).toBe('Original project')
    expect(footer.find('a[href*="paypal"]').exists()).toBe(false)
    expect(footer.text()).not.toContain('Proudly made in EU')
  })

  it('usa .bsc-btn sull\'accettazione dei cookie senza toccare ruolo ed etichetta', async () => {
    const wrapper = await mountApp()
    // Il banner compare solo se il consenso non è già stato dato.
    const banner = wrapper.find('[role="region"]')
    expect(banner.exists()).toBe(true)
    expect(banner.attributes('aria-label')).toBe('Cookies')
    expect(banner.attributes('aria-describedby')).toBe('gdpr-desc')

    const accept = banner.find('button')
    expect(accept.classes()).toContain('bsc-btn')
    expect(accept.classes()).toContain('bg-amber-600')
  })

  it('accettando i cookie il banner sparisce e il consenso resta scritto', async () => {
    const wrapper = await mountApp()
    await wrapper.find('[role="region"] button').trigger('click')
    expect(localStorage.getItem('gdpr-accepted')).toBe('1')
    expect(wrapper.find('[role="region"]').exists()).toBe(false)
  })
})
