import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCharacterStore } from './character'
import { useCloudStore } from './cloud'

let stored: Map<string, string>
let fail = false
let conflict = false
let writes = 0
let secondUser = false
const ident = '11111111-1111-4111-8111-111111111111'
const fetcher = vi.fn(async (input: string, options?: RequestInit) => {
  const method = options?.method || 'GET'
  let data: unknown
  if (input === '/api/session' || input === '/api/login') data = { user: {id: secondUser ? 'bob' : 'alice', username: secondUser ? 'bob' : 'alice'}, csrf: 'csrf' }
  else if (input === '/api/characters' && method === 'GET') data = []
  else if (input.startsWith('/api/characters') && method !== 'GET') {
    writes++
    if (fail) throw new Error('offline')
    if (conflict) return new Response(JSON.stringify({detail:'Another device saved'}), {status:409})
    const body = JSON.parse(String(options?.body))
    data = { id: ident, client_id: body.client_id, data: body.data, revision: body.revision + 1, editable: true }
  }
  return new Response(JSON.stringify(data), { status: 200, headers: {'Content-Type':'application/json'} })
})

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  stored = new Map()
  vi.stubGlobal('localStorage', {getItem: (k: string) => stored.get(k) || null, setItem: (k: string,v: string) => stored.set(k,v), removeItem:(k: string) => stored.delete(k)})
  vi.stubGlobal('fetch', fetcher)
  fail = false; conflict = false; writes = 0; secondUser = false
})

describe('server autosave and private recovery', () => {
  it('debounces unfinished work for one second and saves actual server state', async () => {
    const cloud = useCloudStore(); await cloud.init()
    const character = useCharacterStore()
    character.character.name = 'Unfinished'
    expect(cloud.active?.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(999)
    expect(writes).toBe(0)
    character.character.backstory = 'still editing'
    await vi.advanceTimersByTimeAsync(999)
    expect(writes).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(writes).toBe(1)
    expect(cloud.status).toBe('Saved on server')
    expect(cloud.active?.data.backstory).toBe('still editing')
    expect(stored.has('character')).toBe(false)
    expect(stored.has('dnd:drafts:alice')).toBe(true)
  })

  it('retains an offline draft and retries without claiming it is saved', async () => {
    const cloud = useCloudStore(); await cloud.init()
    useCharacterStore().character.name = 'Offline draft'
    fail = true
    await cloud.flush()
    expect(cloud.active?.dirty).toBe(true)
    expect(cloud.status).toContain('Not saved on server')
    expect(stored.get('dnd:drafts:alice')).toContain('Offline draft')
    fail = false
    await cloud.flush()
    expect(cloud.active?.dirty).toBe(false)
  })

  it('stops conflict retries and keeps both the revision and unsaved text', async () => {
    const cloud = useCloudStore(); await cloud.init()
    useCharacterStore().character.name = 'Original'; await cloud.flush()
    useCharacterStore().character.backstory = 'My unsaved edit'
    conflict = true; await cloud.flush()
    expect(cloud.active?.revision).toBe(1)
    expect(cloud.active?.state).toBe('conflict')
    const count = writes
    await cloud.flush()
    expect(writes).toBe(count)
    expect(cloud.active?.data.backstory).toBe('My unsaved edit')
  })

  it('does not expose another account’s drafts when switching accounts', async () => {
    const cloud = useCloudStore(); await cloud.init()
    useCharacterStore().character.name = 'Alice secret'; await cloud.flush()
    secondUser = true
    await cloud.authenticate('login', 'bob', 'password')
    expect(cloud.user?.id).toBe('bob')
    expect(JSON.stringify(cloud.drafts)).not.toContain('Alice secret')
    expect(useCharacterStore().character.name).toBe('')
    expect(stored.has('dnd:drafts:alice')).toBe(false)
  })
})
