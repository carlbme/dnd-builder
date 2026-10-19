import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useCharacterStore, type CharacterData } from './character'
import { useAppStore } from './app'

export interface User { id: string; username: string }
export interface ServerCharacter {
  id: string; client_id: string; revision: number; editable: boolean
  name: string; variant: string; owner: string; updated_at: number; data: CharacterData
}
export interface Draft {
  data: CharacterData; serverId?: string; revision: number; dirty: boolean
  state: 'pending' | 'saving' | 'saved' | 'failed' | 'conflict'; error?: string
}
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export const useCloudStore = defineStore('cloud', () => {
  const user = ref<User | null>(null)
  const csrf = ref('')
  const ready = ref(false)
  const error = ref('')
  const drafts = ref<Record<string, Draft>>({})
  const library = ref<ServerCharacter[]>([])
  const storageError = ref('')
  const character = useCharacterStore()
  const app = useAppStore()
  let applying = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null
  let started = false
  let authGeneration = 0

  const active = computed(() => drafts.value[character.character.id])
  const hasPending = computed(() => Object.values(drafts.value).some(d => d.dirty))
  const status = computed(() => {
    const d = active.value
    if (!user.value) return 'Sign in to save characters on the server.'
    if (storageError.value) return storageError.value
    if (!d) return 'Edits will autosave to your private library.'
    if (d.state === 'saved') return 'Saved on server'
    if (d.state === 'saving') return 'Saving…'
    if (d.state === 'conflict') return 'Conflict: another device saved this character. Export your draft or reload the server copy.'
    if (d.state === 'failed') return 'Not saved on server. ' + (d.error || 'Reconnect and retry.')
    return 'Unsaved changes — waiting to save…'
  })

  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch('/api' + path, {
      method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf.value }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new ApiError(response.status, typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`)
    return data as T
  }

  function persist() {
    if (!user.value) return
    try {
      localStorage.setItem('dnd:drafts:' + user.value.id, JSON.stringify({ drafts: drafts.value, active: character.character.id, step: app.currentStep }))
      storageError.value = ''
    } catch {
      storageError.value = 'Recovery storage unavailable. Keep this tab open until the server confirms saving; export your work if disconnected.'
    }
  }

  function apply(data: CharacterData, step = 8) {
    applying = true
    character.character = clone(data)
    app.setStep(step)
    applying = false
  }

  function capture() {
    if (applying || !ready.value || !user.value) return
    const data = clone(character.character)
    const old = drafts.value[data.id]
    if (old && JSON.stringify(old.data) === JSON.stringify(data)) return
    drafts.value[data.id] = {
      ...old, data, revision: old?.revision ?? 0, dirty: true,
      state: old?.state === 'conflict' ? 'conflict' : 'pending',
    }
    persist()
    clearTimeout(timer)
    timer = setTimeout(() => { void flush() }, 1000)
  }

  async function savePending() {
    const generation = authGeneration
    for (const [clientId, draft] of Object.entries(drafts.value)) {
      if (!draft.dirty || draft.state === 'conflict') continue
      const snapshot = clone(draft.data)
      const serverId = draft.serverId
      draft.state = 'saving'
      try {
        const result = await request<ServerCharacter>(serverId ? '/characters/' + serverId : '/characters', serverId ? 'PUT' : 'POST', {
          client_id: clientId, revision: draft.revision, data: snapshot,
        })
        if (generation !== authGeneration) return
        const latest = drafts.value[clientId]
        if (!latest) continue
        latest.serverId = result.id
        latest.revision = result.revision
        if (!serverId && JSON.stringify(result.data) !== JSON.stringify(snapshot)) {
          latest.state = 'conflict'
          latest.dirty = true
        } else {
          latest.dirty = JSON.stringify(latest.data) !== JSON.stringify(snapshot)
          latest.state = latest.dirty ? 'pending' : 'saved'
          latest.error = undefined
        }
      } catch (e) {
        if (generation !== authGeneration) return
        const latest = drafts.value[clientId]
        if (latest) {
          latest.state = e instanceof ApiError && e.status === 409 ? 'conflict' : 'failed'
          latest.error = e instanceof Error ? e.message : 'Connection failed; retry when online.'
        }
      }
      persist()
    }
  }

  async function flush() {
    clearTimeout(timer)
    if (running) { await running; return flush() }
    if (!user.value) return
    running = savePending()
    try { await running } finally { running = null }
    if (Object.values(drafts.value).some(d => d.dirty && d.state === 'pending')) {
      timer = setTimeout(() => { void flush() }, 1000)
    }
  }

  async function refreshLibrary() {
    library.value = await request<ServerCharacter[]>('/characters')
  }

  async function adopt(next: { user: User | null; csrf: string }) {
    authGeneration++
    clearTimeout(timer)
    const previous = user.value?.id
    csrf.value = next.csrf
    user.value = next.user
    library.value = []
    drafts.value = {}
    if (previous && previous !== next.user?.id) localStorage.removeItem('dnd:drafts:' + previous)
    applying = true
    character.resetCharacter()
    character.savedCharacters = []
    app.resetSteps()
    applying = false
    if (!next.user) return
    try {
      const raw = localStorage.getItem('dnd:drafts:' + next.user.id)
      if (raw) {
        const stored = JSON.parse(raw) as { drafts: Record<string, Draft>; active: string; step: number }
        drafts.value = stored.drafts || {}
        for (const d of Object.values(drafts.value)) if (d.dirty && d.state !== 'conflict') d.state = 'pending'
        const d = drafts.value[stored.active]
        if (d) {
          if (d.dirty) apply(d.data, stored.step)
          else if (d.serverId) {
            try { await open(d.serverId, stored.step) } catch { apply(d.data, stored.step) }
          }
        }
      }
    } catch { storageError.value = 'Recovery draft could not be read. Server library is still available.' }
    try { await refreshLibrary() } catch { error.value = 'Library unavailable. Reconnect to load server characters.' }
    if (hasPending.value) timer = setTimeout(() => { void flush() }, 1000)
  }

  async function init() {
    if (started) return
    started = true
    try { await adopt(await request('/session')) }
    catch { error.value = 'Account service unavailable. Reconnect and reload to sign in.' }
    ready.value = true
    watch(() => character.character, capture, { deep: true, flush: 'sync' })
    watch(() => app.currentStep, persist)
    // Upstream save button remains useful, but is now a server save.
    character.$onAction(({ name, after }) => {
      if (name === 'saveCharacter') after(() => {
        character.savedCharacters = []
        capture()
        void flush()
      })
    })
    window.addEventListener('online', () => { void flush(); if (user.value) void refreshLibrary().catch(() => {}) })
    window.addEventListener('beforeunload', event => {
      if (hasPending.value) { event.preventDefault(); event.returnValue = '' }
    })
    // Other tabs learn about logout without receiving any private character data.
    window.addEventListener('storage', event => {
      if (event.key === 'dnd:logout' && user.value) {
        authGeneration++
        clearTimeout(timer)
        localStorage.removeItem('dnd:drafts:' + user.value.id)
        user.value = null
        drafts.value = {}
        library.value = []
        applyEmpty()
        window.location.assign('/account')
      }
    })
  }

  function applyEmpty() {
    applying = true
    character.resetCharacter()
    character.savedCharacters = []
    app.resetSteps()
    applying = false
  }

  async function authenticate(mode: 'login' | 'register', username: string, password: string) {
    if (running) await running
    const s = await request<{ user: User | null; csrf: string }>('/session')
    csrf.value = s.csrf
    await adopt(await request('/' + mode, 'POST', { username, password }))
    error.value = ''
  }

  async function logout() {
    await flush()
    if (hasPending.value && !window.confirm('Some changes are not saved on the server. Logout clears recovery drafts on this browser. Cancel and export your drafts first, or confirm logout.')) return false
    const id = user.value?.id
    const result = await request<{ user: User | null; csrf: string }>('/logout', 'POST', {})
    if (id) localStorage.removeItem('dnd:drafts:' + id)
    localStorage.setItem('dnd:logout', crypto.randomUUID())
    await adopt(result)
    return true
  }

  async function open(id: string, step = 8) {
    await flush()
    const result = await request<ServerCharacter>('/characters/' + id)
    if (!result.editable) return result
    const existing = drafts.value[result.client_id]
    if (existing?.dirty) { apply(existing.data, step); return result }
    drafts.value[result.client_id] = { data: result.data, serverId: result.id, revision: result.revision, dirty: false, state: 'saved' }
    apply(result.data, step)
    persist()
    return result
  }

  async function reloadActive() {
    const d = active.value
    if (!d?.serverId || !window.confirm('Replace this unsaved draft with the server copy? Export it first if you want to keep it.')) return
    const result = await request<ServerCharacter>('/characters/' + d.serverId)
    drafts.value[result.client_id] = { data: result.data, serverId: result.id, revision: result.revision, dirty: false, state: 'saved' }
    apply(result.data)
    persist()
  }

  function forgetDeleted(clientId: string) {
    if (character.character.id === clientId) applyEmpty()
    delete drafts.value[clientId]
    persist()
  }

  function exportData(data: CharacterData) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${data.name || 'unfinished-character'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  async function importLegacy(data: CharacterData) {
    await flush()
    character.importJson(JSON.stringify(data))
    app.setStep(8)
    capture()
    await flush()
    await refreshLibrary()
  }

  return { user, csrf, ready, error, drafts, active, library, status, storageError, hasPending,
    request, init, authenticate, logout, flush, open, refreshLibrary, reloadActive, exportData, importLegacy, forgetDeleted }
})
