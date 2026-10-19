import { test, expect, type Page, type BrowserContext } from '@playwright/test'
const password = 'Acceptance-only password 123!'
const suffix = Date.now().toString(36)
const names = {alice:'alice_'+suffix, bob:'bob_'+suffix, dm:'dm_'+suffix}

async function register(page: Page, name: string) {
  await page.goto('/account')
  await page.getByRole('button', {name:'Register',exact:true}).click()
  await page.getByLabel('Username (').fill(name)
  await page.getByLabel('Password (').fill(password)
  await page.getByRole('button', {name:'Create account',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Character library',exact:true})).toBeVisible()
}
async function api(context: BrowserContext, path: string, method='GET', data?: unknown) {
  const session = await context.request.get('/api/session')
  const csrf = (await session.json()).csrf
  return context.request.fetch('/api'+path, {method,data,headers:{Origin:'http://localhost:14111','X-CSRF-Token':csrf}})
}
async function importJson(page: Page, data: object, name='character.json') {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))})
  await expect(page).toHaveURL(/\/builder/, {timeout:15000})
  await expect(page.getByText('Saved on server',{exact:true})).toBeVisible()
}

test('accounts, four variants, shared exports, offline drafts and concurrent edits', async ({browser}) => {
  const a = await browser.newContext({baseURL:'http://localhost:14111', locale:'en-US'})
  const b = await browser.newContext({baseURL:'http://localhost:14111', locale:'en-US'})
  const d = await browser.newContext({baseURL:'http://localhost:14111', locale:'en-US'})
  const alice = await a.newPage(), bob = await b.newPage(), dm = await d.newPage()
  const browserErrors: string[] = []
  for (const p of [alice,bob,dm]) p.on('pageerror', e => browserErrors.push(e.message))
  await register(alice,names.alice)
  await register(bob,names.bob)
  await register(dm,names.dm)
  // Start with a real UI-generated character, so exports and rule rendering use
  // the full upstream schema rather than a hand-built test approximation.
  await alice.goto('/')
  await alice.getByRole('button', {name:/random/i}).first().click()
  await expect(alice).toHaveURL(/\/builder/)
  await expect(alice.getByText('Saved on server',{exact:true})).toBeVisible()
  let rows = await (await api(a,'/characters')).json()
  expect(rows.length).toBeGreaterThan(0)
  const original = rows.find((r: {name:string}) => r.name !== 'Unfinished character') || rows[0]
  const path = '/characters/'+original.id
  const originalData = (await (await api(a,path)).json()).data
  expect((await api(b,path)).status()).toBe(404)
  expect((await (await api(b,'/characters')).json()).length).toBe(0)
  // JSON imports preserve all supported game variants and create new identities.
  for (const variant of ['dnd5e','dnd2024','brancalonia','apocalisse']) {
    await importJson(alice,{...originalData,variant,name:'Acceptance '+variant})
    const download = alice.waitForEvent('download')
    await alice.getByRole('button',{name:/export pdf|download pdf/i}).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  }
  rows = await (await api(a,'/characters')).json()
  const target = rows.find((r: {name:string}) => r.name === 'Acceptance dnd5e')
  const targetPath = '/characters/'+target.id
  await alice.goto('/characters')
  const card = alice.locator('article').filter({has:alice.getByText('Acceptance dnd5e',{exact:true})}).first()
  await card.getByRole('button',{name:'Manage sharing'}).click()
  await alice.getByLabel('Existing username').fill(names.dm)
  await alice.getByRole('button',{name:'Grant view access'}).click()
  await expect(alice.getByRole('button',{name:'Revoke access'})).toBeVisible()
  await dm.goto('/characters')
  await expect(dm.getByText('Acceptance dnd5e',{exact:true})).toBeVisible()
  await dm.getByRole('link',{name:'View / Export'}).click()
  await expect(dm.getByText('View only · Shared by '+names.alice,{exact:false})).toBeVisible()
  const jsonDownload = dm.waitForEvent('download')
  await dm.getByRole('button',{name:'Export JSON',exact:true}).click()
  expect((await jsonDownload).suggestedFilename()).toContain('.json')
  const pdfDownload = dm.waitForEvent('download')
  await dm.getByRole('button',{name:'Export PDF',exact:true}).click()
  expect((await pdfDownload).suggestedFilename()).toContain('.pdf')
  const record = await (await api(d,targetPath)).json()
  expect((await api(d,targetPath,'PUT',{client_id:record.client_id,revision:record.revision,data:record.data})).status()).toBe(403)
  expect((await api(d,targetPath+'?revision='+record.revision,'DELETE')).status()).toBe(403)
  await alice.getByRole('button',{name:'Revoke access'}).click()
  await expect(alice.getByRole('button',{name:'Revoke access'})).toHaveCount(0)
  expect((await api(d,targetPath)).status()).toBe(404)
  await dm.reload()
  await expect(dm.getByRole('button',{name:'Export JSON',exact:true})).toHaveCount(0)
  // Explicit browser migration creates a new server record and keeps originals.
  const legacy = {...originalData, name:'Legacy browser original'}
  const legacyRaw = JSON.stringify({savedCharacters:[legacy]})
  await alice.evaluate(raw => localStorage.setItem('character', raw), legacyRaw)
  await alice.goto('/characters')
  await alice.getByRole('button',{name:'Import a new copy',exact:true}).click()
  await expect(alice.locator('article').filter({has:alice.getByText('Legacy browser original',{exact:true})}).first()).toBeVisible()
  await expect.poll(async () => (await (await api(a,'/characters')).json()).filter((r:{name:string})=>r.name==='Legacy browser original').length).toBe(1)
  expect(await alice.evaluate(()=>localStorage.getItem('character'))).toBe(legacyRaw)
  // Open on two owner devices, then provoke a real stale revision conflict.
  const second = await browser.newContext({baseURL:'http://localhost:14111',storageState:await a.storageState()})
  const other = await second.newPage()
  await alice.goto('/characters')
  await alice.locator('article').filter({has:alice.getByText('Acceptance dnd5e',{exact:true})}).first().getByRole('button',{name:'Edit',exact:true}).click()
  await other.goto('/characters')
  await other.locator('article').filter({has:other.getByText('Acceptance dnd5e',{exact:true})}).first().getByRole('button',{name:'Edit',exact:true}).click()
  // The exported document supplies an untouched upstream-compatible structure.
  // Changing via the rendered details inputs exercises the same reactive path.
  await alice.getByRole('button',{name:'Details (8/9)',exact:true}).click()
  await other.getByRole('button',{name:'Details (8/9)',exact:true}).click()
  const inputA = alice.getByLabel(/character name/i)
  const inputOther = other.getByLabel(/character name/i)
  await inputA.fill('Saved device one')
  await expect(alice.getByText('Saved on server',{exact:true})).toBeVisible()
  await inputOther.fill('Unsaved device two')
  await expect(other.getByText(/Conflict: another device/)).toBeVisible()
  expect((await (await api(a,targetPath)).json()).data.name).toBe('Saved device one')
  const recovery = other.waitForEvent('download')
  await other.getByRole('button',{name:'Export current draft'}).click()
  expect((await recovery).suggestedFilename()).toContain('Unsaved device two')
  // A network outage keeps accurate status and retries after reconnection.
  await a.setOffline(true)
  await inputA.fill('Offline unfinished work')
  await expect(alice.getByText(/Not saved on server/)).toBeVisible()
  await a.setOffline(false)
  await expect(alice.getByText('Saved on server',{exact:true})).toBeVisible()
  expect((await (await api(a,targetPath)).json()).data.name).toBe('Offline unfinished work')
  // Browser-data deletion loses no confirmed server save: use a fresh context.
  const fresh = await browser.newContext({baseURL:'http://localhost:14111'})
  const login = await fresh.newPage()
  await login.goto('/account')
  await login.getByLabel('Username (').fill(names.alice)
  await login.getByLabel('Password (').fill(password)
  await login.getByRole('button',{name:'Sign in',exact:true}).last().click()
  await expect(login.getByText('Offline unfinished work',{exact:true})).toBeVisible()
  // Application caches must contain no private API responses.
  const cached = await alice.evaluate(async () => {
    const names = await caches.keys()
    return (await Promise.all(names.map(async n => (await (await caches.open(n)).keys()).map(r=>r.url)))).flat()
  })
  expect(cached.some(url => new URL(url).pathname.startsWith('/api/'))).toBe(false)
  await alice.goto('/account')
  await alice.getByRole('button',{name:'Log out and clear private cached data'}).click()
  await expect(alice.getByRole('heading',{name:'Welcome to D&D Builder'})).toBeVisible()
  expect(await alice.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('dnd:drafts:')))).toHaveLength(0)
  expect(browserErrors).toEqual([])
  await Promise.all([a.close(),b.close(),d.close(),second.close(),fresh.close()])
})
